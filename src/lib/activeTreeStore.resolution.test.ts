// Feature: multiple-family-trees, Property 8: Active-tree resolution
//
// Validates: Requirements 2.4, 2.5, 6.3
//
// For any registry and any pointer value, the active-tree store's
// `bootstrap()` resolves the Active_Tree by:
//   1. selecting the pointed-to tree when the persisted pointer references
//      an existing tree (Req 2.4); else
//   2. selecting `mostRecentTree(registry)` when the pointer is missing or
//      points to a non-existent id and the registry is non-empty (Req 2.5,
//      6.3); else
//   3. on an empty registry, creating the default tree
//      ("My Family Tree") and activating it (Req 2.6 — listed for context;
//      this property test only asserts that an Active_Tree is established
//      and references an existing row in the registry afterwards).
//
// Strategy (approach A from task 6.2):
//   - The active-tree store calls `bootstrap()` against the singleton DB,
//     so each iteration first clears the four Dexie tables and
//     `localStorage`, and resets the zustand store back to its initial
//     state. Without these resets a residual value from a previous
//     iteration could mask a regression in resolution.
//   - Trees are seeded directly via `db.trees.bulkAdd` and the pointer is
//     written via `writeActiveTreePointer` so the test exercises the same
//     read paths the production bootstrap uses.
//   - Three pointer modes are generated: `'none'` (no pointer written),
//     `'existing'` (pointer references one of the seeded trees), and
//     `'invalid'` (pointer references an id that is NOT in the registry).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { db } from './db';
import {
  clearActiveTreePointer,
  writeActiveTreePointer,
} from './activeTreePointer';
import { useActiveTreeStore } from './activeTreeStore';
import { mostRecentTree } from './trees';
import { DEFAULT_TREE_NAME, type Tree } from './domain';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wipe every Dexie table the store touches in a single rw transaction. */
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
 * Reset the zustand store back to its documented initial values. Action
 * functions remain intact (zustand's `setState` does a partial merge), so
 * subsequent calls to `bootstrap()` etc. still hit the production code.
 */
function resetStore(): void {
  useActiveTreeStore.setState({
    trees: [],
    activeTreeId: null,
    isReady: false,
    status: 'no-selection',
    error: null,
  });
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

// nanoid-shaped id (21-char alphabet) — same shape used elsewhere in the
// app so collisions with stored ids stay astronomically unlikely.
const idArb = fc.stringMatching(/^[A-Za-z0-9_-]{21}$/);
const treeNameArb = fc.string({ minLength: 1, maxLength: 30 });

/**
 * Pointer behaviour for an iteration:
 *   - 'none'     : no pointer is written.
 *   - 'existing' : pointer references one of the seeded trees (chosen via
 *                  `idx % trees.length`); falls back to 'none' when the
 *                  registry is empty.
 *   - 'invalid'  : pointer references an id NOT present in the registry.
 */
type PointerMode =
  | { kind: 'none' }
  | { kind: 'existing'; idx: number }
  | { kind: 'invalid'; id: string };

const pointerModeArb: fc.Arbitrary<PointerMode> = fc.oneof(
  fc.constant<PointerMode>({ kind: 'none' }),
  fc
    .nat({ max: 1_000 })
    .map<PointerMode>((idx) => ({ kind: 'existing', idx })),
  idArb.map<PointerMode>((id) => ({ kind: 'invalid', id })),
);

/**
 * A whole scenario:
 *   - `numTrees` between 0 and 4 — covers the empty-registry branch
 *     (Req 2.6) plus small non-empty registries.
 *   - `treeIdSeeds` provides a fixed pool of 4 unique ids that are sliced
 *     to `numTrees`. Generating the upper bound avoids `fc.chain` and
 *     keeps shrinking deterministic when `numTrees` shrinks.
 */
const scenarioArb = fc.record({
  numTrees: fc.integer({ min: 0, max: 4 }),
  treeIdSeeds: fc.uniqueArray(idArb, { minLength: 4, maxLength: 4 }),
  treeNames: fc.array(treeNameArb, { minLength: 4, maxLength: 4 }),
  pointer: pointerModeArb,
});

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('useActiveTreeStore.bootstrap resolution (Property 8)', () => {
  beforeEach(async () => {
    await clearAllTables();
    window.localStorage.clear();
    resetStore();
  });

  afterEach(async () => {
    await clearAllTables();
    window.localStorage.clear();
    resetStore();
  });

  // Property 8: Active-tree resolution
  // For any registry and any pointer value, resolution returns the
  // pointed-to tree when it exists; otherwise mostRecentTree(registry).
  it('resolves to pointed-to tree when valid; else most-recent; on empty registry establishes a default', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (scenario) => {
        // fast-check does NOT run beforeEach between predicate invocations,
        // so reset DB / localStorage / store at the top of each iteration.
        await clearAllTables();
        window.localStorage.clear();
        resetStore();

        // ---------------- seed registry ----------------
        // Distinct, increasing `createdAt` timestamps so `mostRecentTree`
        // is deterministic (it is the last entry of `trees`).
        const trees: Tree[] = [];
        for (let i = 0; i < scenario.numTrees; i += 1) {
          trees.push({
            id: scenario.treeIdSeeds[i],
            name: scenario.treeNames[i],
            createdAt: new Date(Date.UTC(2024, 0, i + 1)).toISOString(),
          });
        }
        if (trees.length > 0) {
          await db.trees.bulkAdd(trees);
        }

        // ---------------- configure pointer ----------------
        let writtenPointer: string | null = null;
        if (scenario.pointer.kind === 'existing' && trees.length > 0) {
          const idx = scenario.pointer.idx % trees.length;
          writtenPointer = trees[idx].id;
          writeActiveTreePointer(writtenPointer);
        } else if (scenario.pointer.kind === 'invalid') {
          // Defensively keep the synthetic id distinct from every seeded
          // id so this iteration unambiguously exercises the "pointer
          // references missing tree" branch even on the off chance the
          // generator produced a colliding nanoid-shaped string.
          let candidate = scenario.pointer.id;
          while (trees.some((t) => t.id === candidate)) {
            candidate = `${candidate}_x`;
          }
          writtenPointer = candidate;
          writeActiveTreePointer(candidate);
        } else {
          // 'none', or 'existing' with empty registry — leave the pointer
          // unset so resolution falls back to mostRecentTree / default.
          clearActiveTreePointer();
        }

        // ---------------- act ----------------
        await useActiveTreeStore.getState().bootstrap();

        const state = useActiveTreeStore.getState();

        // ---------------- assert resolution ----------------
        if (scenario.numTrees === 0) {
          // Empty registry: bootstrap creates the default tree
          // ("My Family Tree") and activates it. The pointer (if it was
          // 'invalid') cannot reference the freshly minted default id, so
          // resolution falls through to the only tree in the registry.
          expect(state.activeTreeId).not.toBeNull();
          const stored = await db.trees.toArray();
          expect(stored).toHaveLength(1);
          expect(stored[0].name).toBe(DEFAULT_TREE_NAME);
          expect(state.activeTreeId).toBe(stored[0].id);
        } else if (
          writtenPointer !== null &&
          trees.some((t) => t.id === writtenPointer)
        ) {
          // Pointer references an existing tree → that tree is active
          // (Req 2.4).
          expect(state.activeTreeId).toBe(writtenPointer);
        } else {
          // No pointer, or pointer references a missing tree → most
          // recently created tree is active (Req 2.5, 6.3).
          const expected = mostRecentTree(trees);
          expect(expected).toBeDefined();
          expect(state.activeTreeId).toBe(expected!.id);
        }

        // ---------------- registry is unchanged when non-empty ---------
        // The empty-registry branch creates the default tree, which is
        // by design a registry mutation; everywhere else, bootstrap MUST
        // leave the seeded registry intact.
        if (scenario.numTrees > 0) {
          expect(await db.trees.count()).toBe(trees.length);
        }
      }),
      { numRuns: 100 },
    );
  });
});
