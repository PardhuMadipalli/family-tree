import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { Id, ParentChildV1, UnionV1 } from './domain';
import {
  addParentChildLink as dbAddParentChildLink,
  addUnion as dbAddUnion,
  deleteParentChildLink as dbDeleteParentChildLink,
  deleteUnion as dbDeleteUnion,
  getAllParentChildLinks,
  getAllUnions,
} from './db';

type RelationsState = {
  unions: UnionV1[];
  parentChildLinks: ParentChildV1[];
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
    const [unions, parentChildLinks] = await Promise.all([
      getAllUnions(),
      getAllParentChildLinks(),
    ]);
    set({ unions, parentChildLinks, isHydrated: true });
  },
  addUnion: async (partnerIds, params) => {
    const now = new Date().toISOString();
    const union: UnionV1 = {
      id: nanoid(),
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
    const prev = get().unions;
    set({ unions: prev.filter((u) => u.id !== id) });
    try {
      await dbDeleteUnion(id);
    } catch (e) {
      set({ unions: prev });
      throw e;
    }
  },
  addParentChildLink: async (parentIds, childId) => {
    const link: ParentChildV1 = { id: nanoid(), parentIds, childId };
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
    const prev = get().parentChildLinks;
    set({ parentChildLinks: prev.filter((l) => l.id !== id) });
    try {
      await dbDeleteParentChildLink(id);
    } catch (e) {
      set({ parentChildLinks: prev });
      throw e;
    }
  },
}));


