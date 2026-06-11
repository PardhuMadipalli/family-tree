import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { Id, PersonV1, StoredPerson } from './domain';
import {
  addPerson as dbAddPerson,
  deletePerson as dbDeletePerson,
  getPeopleByTree,
  updatePerson as dbUpdatePerson,
} from './db';
import { useActiveTreeStore } from './activeTreeStore';

type PeopleState = {
  // Tree-scoped: only the Active_Tree's people live in the store
  // (Req 1.3). The full Dexie shape (`StoredPerson`) is kept here so
  // callers can rely on the `treeId` association if needed.
  people: StoredPerson[];
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  addPerson: (input: Omit<PersonV1, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Id>;
  updatePerson: (id: Id, updates: Partial<StoredPerson>) => Promise<void>;
  deletePerson: (id: Id) => Promise<void>;
};

export const usePeopleStore = create<PeopleState>((set, get) => ({
  people: [],
  isHydrated: false,
  hydrate: async () => {
    // Read the Active_Tree id lazily from inside the function body. This
    // avoids any TDZ issue from the circular import with `activeTreeStore`
    // (which imports this store to drive re-hydration on tree switch);
    // Zustand stores are safe to access lazily because their factory does
    // not call our action functions during module evaluation.
    const activeTreeId = useActiveTreeStore.getState().activeTreeId;
    if (activeTreeId === null) {
      // No tree selected -> empty store, so the People page renders the
      // "no tree selected" state instead of records from another tree
      // (Req 1.5).
      set({ people: [], isHydrated: true });
      return;
    }
    const people = await getPeopleByTree(activeTreeId);
    console.log('Hydrated people', people.length);
    set({ people, isHydrated: true });
  },
  addPerson: async (input) => {
    // Writes are scoped to the Active_Tree. Refusing the write when no
    // tree is selected keeps the never-orphaned-record invariant
    // (Req 1.2, 1.4).
    const activeTreeId = useActiveTreeStore.getState().activeTreeId;
    if (activeTreeId === null) {
      throw new Error('No active tree');
    }
    const now = new Date().toISOString();
    const person: StoredPerson = {
      id: nanoid(),
      treeId: activeTreeId,
      createdAt: now,
      updatedAt: now,
      ...input,
    };
    // optimistic update
    set({ people: [person, ...get().people] });
    try {
      await dbAddPerson(person);
      return person.id;
    } catch (error) {
      // rollback
      set({ people: get().people.filter((p) => p.id !== person.id) });
      throw error;
    }
  },
  updatePerson: async (id, updates) => {
    // Reads of `activeTreeId` must happen lazily inside the action body
    // (same TDZ-safety reason as `hydrate`/`addPerson`). The DB helpers
    // now require the treeId to disambiguate the compound primary key
    // `[id+treeId]`.
    const activeTreeId = useActiveTreeStore.getState().activeTreeId;
    if (activeTreeId === null) {
      throw new Error('No active tree');
    }
    const previous = get().people;
    const now = new Date().toISOString();
    const next = previous.map((p) => (p.id === id ? { ...p, ...updates, updatedAt: now } : p));
    set({ people: next });
    try {
      await dbUpdatePerson(id, activeTreeId, { ...updates, updatedAt: now });
    } catch (error) {
      set({ people: previous });
      throw error;
    }
  },
  deletePerson: async (id) => {
    const activeTreeId = useActiveTreeStore.getState().activeTreeId;
    if (activeTreeId === null) {
      throw new Error('No active tree');
    }
    const previous = get().people;
    set({ people: previous.filter((p) => p.id !== id) });
    try {
      await dbDeletePerson(id, activeTreeId);
    } catch (error) {
      set({ people: previous });
      throw error;
    }
  },
}));



