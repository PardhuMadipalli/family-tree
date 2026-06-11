// Feature: multiple-family-trees, Property 9: Never zero trees
//
// Validates: Requirements 6.4
//
// Starting from a registry containing exactly one tree (with or without
// records), calling `useActiveTreeStore.deleteTree` on that only tree must
// result in a registry that still contains exactly one tree, whose name is
// `DEFAULT_TREE_NAME`, and which is set as the Active_Tree.
//
// Strategy:
//   - Per iteration, clear all four Dexie tables, clear `localStorage`, and
//     reset the Zustand store to its initial in-memory state so the
//     bootstrap path is exercised cleanly.
//   - Generate one tree config (arbitrary valid name; arbitrary numbers of
//     people / unions / parent-child links, including zero) and seed the
//     registry + records via direct Dexie writes.
//   - Call `bootstrap()` so the store loads the seeded tree and activates
//     it (this also exercises the pointer round-trip).
//   - Call `deleteTree(treeId)` on the only tree and assert the
//     never-zero-trees invariant: registry size === 1, the remaining
//     tree's name equals `DEFAULT_TREE_NAME`, and the store's
//     `activeTreeId` references that remaining tree.
//
// `numRuns: 30` is sufficient because the input space is small (the only
// generated dimensions are a tree's display name and per-record-table
// counts in the [0, 3] range); 100 would be fine too.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { nanoid } from 'nanoid';

import { db } from './db';
import { useActiveTreeStore } from './activeTreeStore';
import { usePeopleStore } from './store';
import { useRelationsStore } from './relationsStore';
import {
  DEFAULT_TREE_NAME,
  MAX_TREE_NAME_LENGTH,
  type StoredParentChild,
  type StoredPerson,
  type StoredUnion,
  type Tree,
} from './domain';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wipe all four tables in a single rw transaction. */
async function clearAllTables(): Promise<void> {
  await db.transaction(
    'rw',
    db.trees,
    db.people,
    db.unions,
    db.parentChildLinks,
    async () => {
      await db.trees.clear();
      await db.people.clear();
      await db.unions.clear();
      await db.parentChildLinks.clear();
    },
  );
}

/**
 * Reset the active-tree Zustand store and the two record stores back to
 * their initial in-memory shape. Required between iterations because
 * Zustand stores are module-level singletons and otherwise carry state
 * forward into the next iteration.
 */
function resetStores(): void {
  useActiveTreeStore.setState({
    trees: [],
    activeTreeId: null,
    isReady: false,
    status: 'no-selection',
    error: null,
  });
  usePeopleStore.setState({ people: [], isHydrated: false });
  useRelationsStore.setState({
    unions: [],
    parentChildLinks: [],
    isHydrated: false,
  });
}

/** Reset everything (DB + localStorage + stores) for a fresh iteration. */
async function resetAll(): Promise<void> {
  await clearAllTables();
  window.localStorage.clear();
  resetStores();
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * A "trimmed" tree name — a non-empty string with no leading or trailing
 * whitespace, length 1..MAX_TREE_NAME_LENGTH (inclusive). The name does
 * not need to be especially exotic for this property: it only needs to be
 * valid so the seeded tree can pass through the lifecycle code paths.
 */
const trimmedNameArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: MAX_TREE_NAME_LENGTH })
  .map((s) => s.trim())
  .filter((s) => s.length >= 1 && s.length <= MAX_TREE_NAME_LENGTH);

/**
 * Per-tree configuration: name plus per-record-table counts. Counts are
 * bounded so each iteration stays cheap under fake-indexeddb while still
 * exercising the M=0 (empty tree) edge case.
 */
const treeConfigArb = fc.record({
  name: trimmedNameArb,
  numPeople: fc.integer({ min: 0, max: 3 }),
  numUnions: fc.integer({ min: 0, max: 3 }),
  numLinks: fc.integer({ min: 0, max: 3 }),
});

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('useActiveTreeStore.deleteTree never-zero-trees invariant (Property 9)', () => {
  beforeEach(async () => {
    await resetAll();
  });
  afterEach(async () => {
    await resetAll();
  });

  // Property 9: Never zero trees
  // For any registry containing exactly one tree, deleting that tree leaves
  // the registry with exactly one tree named DEFAULT_TREE_NAME set as the
  // Active_Tree.
  it('replaces the only tree with a fresh DEFAULT_TREE_NAME tree set as Active_Tree', async () => {
    await fc.assert(
      fc.asyncProperty(treeConfigArb, async (cfg) => {
        // fast-check does not run beforeEach between predicate invocations
        // inside a single fc.assert call, so reset everything at the start
        // of every iteration.
        await resetAll();

        // -------------------------------------------------------------
        // Seed: one tree (with the generated name) plus its records.
        // -------------------------------------------------------------
        const tree: Tree = {
          id: nanoid(),
          name: cfg.name,
          createdAt: new Date(2020, 0, 1).toISOString(),
        };

        const people: StoredPerson[] = Array.from(
          { length: cfg.numPeople },
          (_, i) => ({
            id: nanoid(),
            treeId: tree.id,
            givenName: `p-${i}`,
            createdAt: '2020-01-01T00:00:00.000Z',
            updatedAt: '2020-01-01T00:00:00.000Z',
          }),
        );

        const unions: StoredUnion[] = Array.from(
          { length: cfg.numUnions },
          (_, i) => ({
            id: nanoid(),
            treeId: tree.id,
            partnerIds: [nanoid(), nanoid()],
            notes: `u-${i}`,
            createdAt: '2020-01-01T00:00:00.000Z',
            updatedAt: '2020-01-01T00:00:00.000Z',
          }),
        );

        const links: StoredParentChild[] = Array.from(
          { length: cfg.numLinks },
          () => ({
            id: nanoid(),
            treeId: tree.id,
            parentIds: [nanoid()],
            childId: nanoid(),
          }),
        );

        await db.transaction(
          'rw',
          db.trees,
          db.people,
          db.unions,
          db.parentChildLinks,
          async () => {
            await db.trees.add(tree);
            if (people.length > 0) await db.people.bulkAdd(people);
            if (unions.length > 0) await db.unions.bulkAdd(unions);
            if (links.length > 0) await db.parentChildLinks.bulkAdd(links);
          },
        );

        // -------------------------------------------------------------
        // Bootstrap: load the registry, resolve the active tree, and
        // hydrate the record stores. With exactly one tree present the
        // store should activate that tree.
        // -------------------------------------------------------------
        await useActiveTreeStore.getState().bootstrap();

        // Sanity: pre-condition is a single-tree registry with the
        // seeded tree as the Active_Tree.
        expect(useActiveTreeStore.getState().trees).toHaveLength(1);
        expect(useActiveTreeStore.getState().activeTreeId).toBe(tree.id);

        // -------------------------------------------------------------
        // Act: delete the only tree.
        // -------------------------------------------------------------
        await useActiveTreeStore.getState().deleteTree(tree.id);

        // -------------------------------------------------------------
        // Assert the never-zero-trees invariant (Req 6.4 / Property 9).
        // -------------------------------------------------------------
        const state = useActiveTreeStore.getState();

        // 1) Registry still contains exactly one tree.
        expect(state.trees).toHaveLength(1);

        // 2) The remaining tree is named DEFAULT_TREE_NAME.
        const remaining = state.trees[0];
        expect(remaining.name).toBe(DEFAULT_TREE_NAME);

        // 3) The remaining tree is the Active_Tree.
        expect(state.activeTreeId).toBe(remaining.id);

        // 4) The remaining tree is a fresh tree, not the deleted one.
        expect(remaining.id).not.toBe(tree.id);

        // 5) The persisted registry agrees with the in-memory store.
        const persistedTrees = await db.trees.toArray();
        expect(persistedTrees).toHaveLength(1);
        expect(persistedTrees[0]).toEqual(remaining);

        // 6) Cascade delete removed the original tree's records, and the
        //    new default tree starts empty (no records carry over).
        expect(
          await db.people.where('treeId').equals(tree.id).count(),
        ).toBe(0);
        expect(
          await db.unions.where('treeId').equals(tree.id).count(),
        ).toBe(0);
        expect(
          await db.parentChildLinks.where('treeId').equals(tree.id).count(),
        ).toBe(0);
        expect(
          await db.people.where('treeId').equals(remaining.id).count(),
        ).toBe(0);
        expect(
          await db.unions.where('treeId').equals(remaining.id).count(),
        ).toBe(0);
        expect(
          await db.parentChildLinks
            .where('treeId')
            .equals(remaining.id)
            .count(),
        ).toBe(0);
      }),
      { numRuns: 30 },
    );
  });
});
