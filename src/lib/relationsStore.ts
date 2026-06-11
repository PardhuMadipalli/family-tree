import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { Id, StoredParentChild, StoredUnion } from './domain';
import {
  addParentChildLink as dbAddParentChildLink,
  addUnion as dbAddUnion,
  deleteParentChildLink as dbDeleteParentChildLink,
  deleteUnion as dbDeleteUnion,
  getParentChildLinksByTree,
  getUnionsByTree,
} from './db';
import { useActiveTreeStore } from './activeTreeStore';

type RelationsState = {
  unions: StoredUnion[];
  parentChildLinks: StoredParentChild[];
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  addUnion: (partnerIds: Id[], params?: { startDate?: string; notes?: string }) => Promise<Id>;
  deleteUnion: (id: Id) => Promise<void>;
  addParentChildLink: (parentIds: Id[], childId: Id) => Promise<Id>;
  deleteParentChildLink: (id: Id) => Promise<void>;
};

export const useRelationsStore = create<RelationsState>((set, get) => ({
  unions: [],
  parentChildLinks: [],
  isHydrated: false,
  hydrate: async () => {
    // Read the active tree id only inside the async body so we don't trigger
    // the activeTreeStore <-> relationsStore circular import during module
    // initialization (the active-tree store imports this store too).
    const activeTreeId = useActiveTreeStore.getState().activeTreeId;
    if (activeTreeId === null) {
      // Req 1.5: no active tree => load zero records.
      set({ unions: [], parentChildLinks: [], isHydrated: true });
      return;
    }
    const [unions, parentChildLinks] = await Promise.all([
      getUnionsByTree(activeTreeId),
      getParentChildLinksByTree(activeTreeId),
    ]);
    console.log('Hydrated relations', unions.length, parentChildLinks.length);
    set({ unions, parentChildLinks, isHydrated: true });
  },
  addUnion: async (partnerIds, params) => {
    const activeTreeId = useActiveTreeStore.getState().activeTreeId;
    if (activeTreeId === null) {
      // Req 1.4: every record write must belong to the Active_Tree.
      throw new Error('No active tree');
    }
    const now = new Date().toISOString();
    const union: StoredUnion = {
      id: nanoid(),
      treeId: activeTreeId,
      partnerIds,
      startDate: params?.startDate,
      notes: params?.notes,
      createdAt: now,
      updatedAt: now,
    };
    set({ unions: [union, ...get().unions] });
    try {
      await dbAddUnion(union);
      return union.id;
    } catch (e) {
      set({ unions: get().unions.filter((u) => u.id !== union.id) });
      throw e;
    }
  },
  deleteUnion: async (id) => {
    // The DB helper now requires the treeId because the compound primary
    // key `[id+treeId]` allows the same union id to legitimately exist in
    // multiple trees. Reading the active tree id lazily here mirrors the
    // pattern used by `hydrate`/`addUnion`.
    const activeTreeId = useActiveTreeStore.getState().activeTreeId;
    if (activeTreeId === null) {
      throw new Error('No active tree');
    }
    const prev = get().unions;
    set({ unions: prev.filter((u) => u.id !== id) });
    try {
      await dbDeleteUnion(id, activeTreeId);
    } catch (e) {
      set({ unions: prev });
      throw e;
    }
  },
  addParentChildLink: async (parentIds, childId) => {
    const activeTreeId = useActiveTreeStore.getState().activeTreeId;
    if (activeTreeId === null) {
      // Req 1.4: every record write must belong to the Active_Tree.
      throw new Error('No active tree');
    }
    const link: StoredParentChild = {
      id: nanoid(),
      treeId: activeTreeId,
      parentIds,
      childId,
    };
    set({ parentChildLinks: [link, ...get().parentChildLinks] });
    try {
      await dbAddParentChildLink(link);
      return link.id;
    } catch (e) {
      set({ parentChildLinks: get().parentChildLinks.filter((l) => l.id !== link.id) });
      throw e;
    }
  },
  deleteParentChildLink: async (id) => {
    const activeTreeId = useActiveTreeStore.getState().activeTreeId;
    if (activeTreeId === null) {
      throw new Error('No active tree');
    }
    const prev = get().parentChildLinks;
    set({ parentChildLinks: prev.filter((l) => l.id !== id) });
    try {
      await dbDeleteParentChildLink(id, activeTreeId);
    } catch (e) {
      set({ parentChildLinks: prev });
      throw e;
    }
  },
}));



