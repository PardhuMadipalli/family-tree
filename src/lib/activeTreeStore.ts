import { create } from 'zustand';
import { nanoid } from 'nanoid';

import { db, getAllTrees } from './db';
import {
  readActiveTreePointer,
  writeActiveTreePointer,
} from './activeTreePointer';
import {
  buildTreeFromEnvelope,
  createTree as createTreeService,
  deleteTree as deleteTreeService,
  deriveImportTreeName,
  mostRecentTree,
  renameTreeChecked,
  type CreateResult,
  type RenameResult,
} from './trees';
import {
  DEFAULT_TREE_NAME,
  type Id,
  type SchemaEnvelopeV1,
  type Tree,
} from './domain';
import { usePeopleStore } from './store';
import { useRelationsStore } from './relationsStore';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * UI status for the active-tree slice (Req 1.5, 1.6, design § "Active-Tree
 * Store"):
 *   - `'ok'`            -> activeTreeId references an existing tree
 *   - `'no-selection'`  -> activeTreeId is null (no tree selected)
 *   - `'unavailable'`   -> activeTreeId is set but does not match any tree
 *                         in the registry
 */
export type ActiveTreeStatus = 'ok' | 'no-selection' | 'unavailable';

/** Result returned by `importAsNewTree` (Req 7.1–7.6 / Property 16). */
export type ImportResult =
  | { ok: true; tree: Tree }
  | { ok: false; reason: string };

export type ActiveTreeState = {
  /** The Tree_Registry, ordered by `createdAt` descending (most recent first). */
  trees: Tree[];
  /** Identifier of the Active_Tree, or `null` when no tree is selected. */
  activeTreeId: Id | null;
  /** True after `bootstrap()` has resolved an Active_Tree (success or otherwise). */
  isReady: boolean;
  /** Derived from `trees` + `activeTreeId`; drives the UI banner copy. */
  status: ActiveTreeStatus;
  /** Latest user-facing error message, or `null` when no error is pending. */
  error: string | null;

  /**
   * Resolves the Active_Tree at app start (design § "Startup / Active-Tree
   * Resolution Flow"). Opens Dexie (which triggers the v2 upgrade if
   * needed), loads the registry, picks an active id from the persisted
   * pointer or the most-recently-created tree, creates the default tree
   * when the registry is empty, persists the pointer, marks the store
   * ready, and re-hydrates both record stores (Req 2.4–2.6, 8.2).
   */
  bootstrap: () => Promise<void>;

  /**
   * Switches the Active_Tree to `id`. Captures the previous id, optimistically
   * updates state, persists the pointer, and re-hydrates the record stores.
   * On any failure rolls back to the previous id and surfaces an error
   * indication (Req 2.3, 2.7, 3.3, 3.7, 3.8 / Property 10).
   */
  setActiveTree: (id: Id) => Promise<void>;

  /**
   * Creates a new tree via the lifecycle service. On success refreshes the
   * registry and activates the new tree (Req 4.1, 4.2). Returns the
   * lifecycle service's discriminated result so callers can surface
   * validation messages directly (Req 4.4, 4.5).
   */
  createTree: (name: string) => Promise<CreateResult>;

  /**
   * Renames the tree with the given `id`. Refreshes the registry on success
   * (Req 5.1, 5.2). Returns the lifecycle service's discriminated result so
   * callers can surface validation messages directly (Req 5.3, 5.4).
   */
  renameActiveOrTree: (id: Id, name: string) => Promise<RenameResult>;

  /**
   * Deletes a tree and all of its records (cascade, Req 6.2). If the deleted
   * tree was the Active_Tree, activates the most-recently-created remaining
   * tree (Req 6.3). If the registry would otherwise be empty, creates the
   * default tree and activates it (Req 6.4 / Property 9). Surfaces an
   * error indication on failure without changing any state (Req 6.7).
   */
  deleteTree: (id: Id) => Promise<void>;

  /**
   * Imports a validated `SchemaEnvelopeV1` as a brand-new tree. Persists
   * the new tree row and all stamped records inside a single Dexie `rw`
   * transaction so the operation is atomic (Req 7.4, 7.5). On success
   * refreshes the registry and activates the new tree (Req 7.6).
   */
  importAsNewTree: (
    envelope: SchemaEnvelopeV1,
    providedName: string | undefined,
    fileName?: string,
  ) => Promise<ImportResult>;

  /** Reloads `trees[]` from the registry table. */
  refreshRegistry: () => Promise<void>;

  /**
   * Clears the latest user-facing error. Used by the status banner's
   * dismiss control so the user can acknowledge a transient failure
   * without affecting the persisted Active_Tree or the registry
   * (Req 1.5, 1.6, 2.7, 3.8, 6.7 — task 9.2).
   */
  clearError: () => void;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compute the UI status for the given snapshot. Centralised so every state
 * mutation that touches `trees` or `activeTreeId` produces a consistent
 * status (Req 1.5, 1.6).
 */
function computeStatus(
  trees: Tree[],
  activeTreeId: Id | null,
): ActiveTreeStatus {
  if (activeTreeId === null) return 'no-selection';
  return trees.some((t) => t.id === activeTreeId) ? 'ok' : 'unavailable';
}

/**
 * Re-hydrate both record stores so the rest of the UI sees the active
 * tree's records.
 *
 * TODO(task 8.1/8.2): once `usePeopleStore` and `useRelationsStore` are
 * tree-scoped, these `hydrate()` calls will load only the active tree's
 * records via `getPeopleByTree` / `getUnionsByTree` /
 * `getParentChildLinksByTree`. Until then they hydrate every record
 * regardless of `activeTreeId`; the active-tree store still calls them as
 * the design intends so the wiring is in place when the scoped reads land.
 */
async function rehydrateRecordStores(): Promise<void> {
  await Promise.all([
    usePeopleStore.getState().hydrate(),
    useRelationsStore.getState().hydrate(),
  ]);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useActiveTreeStore = create<ActiveTreeState>((set, get) => ({
  trees: [],
  activeTreeId: null,
  isReady: false,
  status: 'no-selection',
  error: null,

  bootstrap: async () => {
    // Loading the registry triggers Dexie to open the DB and run the
    // version(2) upgrade if we are coming from a v1 install (Req 8.1).
    let trees = await getAllTrees();

    // Empty registry on a fresh install: create the default tree so the
    // never-zero-trees invariant holds before we resolve the pointer
    // (Req 2.6).
    if (trees.length === 0) {
      const created = await createTreeService(DEFAULT_TREE_NAME);
      if (!created.ok) {
        // DEFAULT_TREE_NAME is hard-coded valid, so this branch is
        // effectively unreachable; surface the error if it ever happens.
        set({
          trees: [],
          activeTreeId: null,
          isReady: true,
          status: 'no-selection',
          error: 'The default tree could not be created',
        });
        return;
      }
      trees = await getAllTrees();
    }

    // Resolution: pointer -> pointed tree if present, else most recent
    // (Req 2.4, 2.5).
    const pointer = readActiveTreePointer();
    const pointed =
      pointer !== null ? trees.find((t) => t.id === pointer) : undefined;
    const resolved = pointed ?? mostRecentTree(trees);

    if (resolved === undefined) {
      // Should be unreachable: the registry was non-empty above. Defensive
      // fallback so the store still resolves to a deterministic state.
      set({
        trees,
        activeTreeId: null,
        isReady: true,
        status: 'no-selection',
        error: null,
      });
      return;
    }

    // Persist the (possibly updated) pointer so future loads start
    // deterministically on this tree (Req 2.2). Pointer write failures are
    // non-fatal: keep the resolved selection in memory and surface the
    // error indication (Req 2.7).
    let pointerError: string | null = null;
    try {
      writeActiveTreePointer(resolved.id);
    } catch {
      pointerError = 'Selection could not be saved';
    }

    set({
      trees,
      activeTreeId: resolved.id,
      isReady: true,
      status: computeStatus(trees, resolved.id),
      error: pointerError,
    });

    // Hydrate after committing state so any concurrent reads of
    // `activeTreeId` from the record stores see the resolved value.
    await rehydrateRecordStores();
  },

  setActiveTree: async (id) => {
    const previous = get().activeTreeId;

    // Idempotent: selecting the already-active tree leaves activeTreeId
    // and the contents of the record stores unchanged (Req 3.7 /
    // Property 10).
    if (previous === id) {
      return;
    }

    // Optimistically apply the new id so anything reading state during the
    // hydrate step (e.g. tree-scoped record stores in tasks 8.1/8.2) sees
    // the new tree.
    set({
      activeTreeId: id,
      status: computeStatus(get().trees, id),
      error: null,
    });

    // 1) Persist the pointer. Failure here is recoverable: roll back to
    //    the previous id and surface "could not be saved" (Req 2.7).
    try {
      writeActiveTreePointer(id);
    } catch {
      set({
        activeTreeId: previous,
        status: computeStatus(get().trees, previous),
        error: 'Selection could not be saved',
      });
      return;
    }

    // 2) Re-hydrate the record stores. On failure roll back the active id
    //    AND restore the previous pointer so the next reload still starts
    //    on the previously visible tree (Req 3.8).
    try {
      await rehydrateRecordStores();
    } catch {
      try {
        if (previous !== null) {
          writeActiveTreePointer(previous);
        }
      } catch {
        // Ignore: the original load failure is already being surfaced.
      }
      set({
        activeTreeId: previous,
        status: computeStatus(get().trees, previous),
        error: 'Tree could not be loaded',
      });
    }
  },

  createTree: async (name) => {
    const result = await createTreeService(name);
    if (!result.ok) {
      // Validation rejection: leave the registry and Active_Tree
      // unchanged (Req 4.4, 4.5 / Property 6).
      return result;
    }
    await get().refreshRegistry();
    await get().setActiveTree(result.tree.id);
    return result;
  },

  renameActiveOrTree: async (id, name) => {
    const result = await renameTreeChecked(id, name);
    if (!result.ok) {
      // Validation rejection: leave the target tree's existing name and
      // all records unchanged (Req 5.3, 5.4 / Property 6).
      return result;
    }
    await get().refreshRegistry();
    return result;
  },

  deleteTree: async (id) => {
    const wasActive = get().activeTreeId === id;

    try {
      await deleteTreeService(id);
    } catch {
      // Atomicity is provided by Dexie's cascade transaction; on failure
      // the registry, records, and Active_Tree are unchanged (Req 6.7).
      set({ error: 'Tree could not be deleted' });
      return;
    }

    let trees = await getAllTrees();

    if (trees.length === 0) {
      // Never zero trees (Req 6.4 / Property 9): create the default tree
      // and activate it.
      const created = await createTreeService(DEFAULT_TREE_NAME);
      if (!created.ok) {
        set({
          trees,
          activeTreeId: null,
          status: computeStatus(trees, null),
          error: 'The default tree could not be created',
        });
        return;
      }
      trees = await getAllTrees();
      set({ trees, error: null });
      await get().setActiveTree(created.tree.id);
      return;
    }

    if (wasActive) {
      // Active tree was deleted but other trees remain: activate the
      // most-recently-created remaining tree (Req 6.3).
      const next = mostRecentTree(trees);
      set({ trees, error: null });
      if (next !== undefined) {
        await get().setActiveTree(next.id);
      }
      return;
    }

    // A non-active tree was deleted: registry shrinks, Active_Tree
    // remains unchanged (Req 6.5).
    set({
      trees,
      status: computeStatus(trees, get().activeTreeId),
      error: null,
    });
  },

  importAsNewTree: async (envelope, providedName, fileName) => {
    const treeName = deriveImportTreeName(providedName, fileName);
    const treeRow: Tree = {
      id: nanoid(),
      name: treeName,
      createdAt: new Date().toISOString(),
    };
    const { people, unions, parentChildLinks } = buildTreeFromEnvelope(
      envelope,
      treeRow.id,
    );

    // Atomic: tree row + all records committed (or rolled back) together
    // so a mid-write failure leaves every previously existing tree's
    // registry entry and records unchanged (Req 7.5).
    try {
      await db.transaction(
        'rw',
        db.trees,
        db.people,
        db.unions,
        db.parentChildLinks,
        async () => {
          await db.trees.add(treeRow);
          if (people.length > 0) {
            await db.people.bulkAdd(people);
          }
          if (unions.length > 0) {
            await db.unions.bulkAdd(unions);
          }
          if (parentChildLinks.length > 0) {
            await db.parentChildLinks.bulkAdd(parentChildLinks);
          }
        },
      );
    } catch (err) {
      const reason =
        err instanceof Error ? err.message : 'Import did not complete';
      return { ok: false, reason };
    }

    await get().refreshRegistry();
    await get().setActiveTree(treeRow.id);
    return { ok: true, tree: treeRow };
  },

  refreshRegistry: async () => {
    const trees = await getAllTrees();
    set({
      trees,
      status: computeStatus(trees, get().activeTreeId),
    });
  },

  clearError: () => {
    // No-op when nothing to clear so we avoid an unnecessary re-render.
    if (get().error === null) return;
    set({ error: null });
  },
}));
