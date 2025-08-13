import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { Id, PersonV1 } from './domain';
import {
  addPerson as dbAddPerson,
  deletePerson as dbDeletePerson,
  getAllPeople,
  updatePerson as dbUpdatePerson,
} from './db';

type PeopleState = {
  people: PersonV1[];
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  addPerson: (input: Omit<PersonV1, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Id>;
  updatePerson: (id: Id, updates: Partial<PersonV1>) => Promise<void>;
  deletePerson: (id: Id) => Promise<void>;
};

export const usePeopleStore = create<PeopleState>((set, get) => ({
  people: [],
  isHydrated: false,
  hydrate: async () => {
    const people = await getAllPeople();
    set({ people, isHydrated: true });
  },
  addPerson: async (input) => {
    const now = new Date().toISOString();
    const person: PersonV1 = { id: nanoid(), createdAt: now, updatedAt: now, ...input };
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
    const previous = get().people;
    const now = new Date().toISOString();
    const next = previous.map((p) => (p.id === id ? { ...p, ...updates, updatedAt: now } : p));
    set({ people: next });
    try {
      await dbUpdatePerson(id, { ...updates, updatedAt: now });
    } catch (error) {
      set({ people: previous });
      throw error;
    }
  },
  deletePerson: async (id) => {
    const previous = get().people;
    set({ people: previous.filter((p) => p.id !== id) });
    try {
      await dbDeletePerson(id);
    } catch (error) {
      set({ people: previous });
      throw error;
    }
  },
}));


