// Feature: multiple-family-trees, Property 7: Rename updates only the name
//
// Validates: Requirements 5.1, 5.5
//
// For any registry containing >= 1 trees (each owning some people, unions,
// and parent-child links) and any name whose *trimmed* length is in
// [1, MAX_TREE_NAME_LENGTH], `renameTreeChecked(targetId, newName)` must:
//   - return `{ ok: true }`,
//   - persist the trimmed name on the target tree's row,
//   - leave the target tree's `id` and `createdAt` unchanged,
//   - leave every other tree's row byte-for-byte unchanged, and
//   - leave every record (in every tree, including the target) byte-for-byte
//     unchanged.
//
// Strategy mirrors the sibling property tests in this directory:
//   - Use the singleton Dexie `db` (backed by `fake-indexeddb` from the
//     shared test setup) and clear all four tables at the start of every
//     iteration. Spinning up a fresh Dexie instance per iteration is heavy
//     because it would re-run the `version(2)` upgrade callback.
//   - Generate trees with disjoint, globally unique record ids so any
//     cross-tree mutation would surface as a structural diff.
//   - Snapshot every persisted row *before* the rename so the post-state
//     comparison is byte-for-byte (`toEqual`) rather than spot-check.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { nanoid } from 'nanoid';

import {
  db,
  getParentChildLinksByTree,
  getPeopleByTree,
  getUnionsByTree,
} from './db';
import { renameTreeChecked } from './trees';
import {
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

/** Stable sort by id so two record sets can be compared with `toEqual`. */
function sortById<T extends { id: string }>(xs: readonly T[]): T[] {
  return [...xs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Visible (non-whitespace) printable-ASCII character generator. Used to build
 * a "core" tree name whose `trim()` is the identity, so that we can
 * deterministically construct names of trimmed-length 1..MAX (with optional
 * surrounding whitespace) without resorting to `fc.filter`.
 */
const visibleCharArb = fc
  .integer({ min: 33, max: 126 })
  .map((code) => String.fromCharCode(code));

/**
 * Tree name with trimmed length in [1, MAX_TREE_NAME_LENGTH], optionally
 * surrounded by ASCII whitespace. Surrounding whitespace exercises the
 * "trimmed value is what gets persisted" half of Req 5.1.
 */
const validRenameNameArb: fc.Arbitrary<string> = fc
  .tuple(
    // leading whitespace: 0..4 chars of space/tab
    fc
      .array(fc.constantFrom(' ', '\t'), { minLength: 0, maxLength: 4 })
      .map((cs) => cs.join('')),
    // core: 1..MAX visible chars; trim() is the identity on this string
    fc
      .array(visibleCharArb, { minLength: 1, maxLength: MAX_TREE_NAME_LENGTH })
      .map((cs) => cs.join('')),
    // trailing whitespace: 0..4 chars of space/tab
    fc
      .array(fc.constantFrom(' ', '\t'), { minLength: 0, maxLength: 4 })
      .map((cs) => cs.join('')),
  )
  .map(([pre, core, post]) => pre + core + post);

/**
 * Per-tree configuration: a display name plus how many of each record kind
 * the tree owns. Counts are bounded to keep each iteration fast while still
 * exercising the M=0 edge case (an empty tree).
 */
const treeConfigArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 30 }),
  numPeople: fc.integer({ min: 0, max: 3 }),
  numUnions: fc.integer({ min: 0, max: 3 }),
  numLinks: fc.integer({ min: 0, max: 3 }),
});

/**
 * A whole scenario: at least one tree (so a rename target always exists),
 * a `targetOffset` we mod by `trees.length` to choose which tree to rename,
 * and a candidate new name (with optional surrounding whitespace).
 */
const scenarioArb = fc.record({
  trees: fc.array(treeConfigArb, { minLength: 1, maxLength: 4 }),
  targetOffset: fc.nat({ max: 1_000 }),
  newName: validRenameNameArb,
});

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('renameTreeChecked updates only the name (Property 7)', () => {
  // Reset DB before and after the suite so a residual row from another
  // suite running in the same process cannot influence the result.
  beforeEach(async () => {
    await clearAllTables();
  });
  afterEach(async () => {
    await clearAllTables();
  });

  // Property 7: Rename updates only the name
  // For any registry and any valid name, after `renameTreeChecked` the
  // target tree's stored name equals the trimmed value, the target's other
  // fields are unchanged, every other tree's row is unchanged, and every
  // record (across all trees) is unchanged.
  it('persists the trimmed name on the target and leaves all other registry rows and all records unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(
        scenarioArb,
        async ({ trees: treeCfgs, targetOffset, newName }) => {
          // fast-check does not run beforeEach between predicate invocations
          // inside a single fc.assert call, so reset the DB at the start of
          // every iteration (matches sibling property tests).
          await clearAllTables();

          // -----------------------------------------------------------
          // Build the in-memory expectation: trees + per-tree records.
          // Stable, unique ids come from nanoid; createdAt is offset per
          // tree so the registry has a deterministic ordering and so the
          // target's createdAt can be checked for byte-equality.
          // -----------------------------------------------------------
          const trees: Tree[] = [];
          const peopleByTreeId = new Map<string, StoredPerson[]>();
          const unionsByTreeId = new Map<string, StoredUnion[]>();
          const linksByTreeId = new Map<string, StoredParentChild[]>();

          treeCfgs.forEach((cfg, treeIdx) => {
            const tree: Tree = {
              id: nanoid(),
              name: cfg.name,
              // Distinct timestamps per tree so the registry has a well
              // defined order and the target's `createdAt` is uniquely
              // identifiable in the post-state.
              createdAt: new Date(2020, 0, 1 + treeIdx).toISOString(),
            };
            trees.push(tree);

            const people: StoredPerson[] = Array.from(
              { length: cfg.numPeople },
              (_, i) => ({
                id: nanoid(),
                treeId: tree.id,
                givenName: `p${treeIdx}-${i}`,
                createdAt: '2020-01-01T00:00:00.000Z',
                updatedAt: '2020-01-01T00:00:00.000Z',
              }),
            );
            peopleByTreeId.set(tree.id, people);

            const unions: StoredUnion[] = Array.from(
              { length: cfg.numUnions },
              (_, i) => ({
                id: nanoid(),
                treeId: tree.id,
                partnerIds: [nanoid(), nanoid()],
                notes: `u${treeIdx}-${i}`,
                createdAt: '2020-01-01T00:00:00.000Z',
                updatedAt: '2020-01-01T00:00:00.000Z',
              }),
            );
            unionsByTreeId.set(tree.id, unions);

            const links: StoredParentChild[] = Array.from(
              { length: cfg.numLinks },
              (_, _i) => ({
                id: nanoid(),
                treeId: tree.id,
                parentIds: [nanoid()],
                childId: nanoid(),
              }),
            );
            linksByTreeId.set(tree.id, links);
          });

          // -----------------------------------------------------------
          // Persist everything to Dexie in a single rw transaction so
          // setup is atomic and fast.
          // -----------------------------------------------------------
          await db.transaction(
            'rw',
            db.trees,
            db.people,
            db.unions,
            db.parentChildLinks,
            async () => {
              await db.trees.bulkAdd(trees);
              for (const ps of peopleByTreeId.values()) {
                if (ps.length > 0) await db.people.bulkAdd(ps);
              }
              for (const us of unionsByTreeId.values()) {
                if (us.length > 0) await db.unions.bulkAdd(us);
              }
              for (const ls of linksByTreeId.values()) {
                if (ls.length > 0) await db.parentChildLinks.bulkAdd(ls);
              }
            },
          );

          // -----------------------------------------------------------
          // Pick exactly one tree as the rename target; the others must
          // be untouched. Snapshot every persisted row *before* the
          // rename for byte-for-byte post-state comparison.
          // -----------------------------------------------------------
          const targetIdx = targetOffset % trees.length;
          const target = trees[targetIdx];
          const others = trees.filter((_, i) => i !== targetIdx);

          // -----------------------------------------------------------
          // Act: rename the chosen tree.
          // -----------------------------------------------------------
          const result = await renameTreeChecked(target.id, newName);

          // -----------------------------------------------------------
          // Assert 1: rename succeeds (the generator only produces names
          // whose trimmed length is in [1, MAX_TREE_NAME_LENGTH]).
          // -----------------------------------------------------------
          expect(result).toEqual({ ok: true });

          // -----------------------------------------------------------
          // Assert 2: target tree's stored name equals newName.trim();
          // its `id` and `createdAt` are unchanged (Req 5.1).
          // -----------------------------------------------------------
          const updatedTarget = await db.trees.get(target.id);
          expect(updatedTarget).toBeDefined();
          expect(updatedTarget!.id).toBe(target.id);
          expect(updatedTarget!.createdAt).toBe(target.createdAt);
          expect(updatedTarget!.name).toBe(newName.trim());

          // -----------------------------------------------------------
          // Assert 3: every other tree's registry row is byte-for-byte
          // unchanged (Req 5.5 — only the target tree's `name` changes).
          // -----------------------------------------------------------
          const remainingTrees = await db.trees.toArray();
          expect(remainingTrees).toHaveLength(trees.length);
          // The full set of other trees should be present unchanged.
          const otherStored = remainingTrees.filter((t) => t.id !== target.id);
          expect(sortById(otherStored)).toEqual(sortById(others));

          // -----------------------------------------------------------
          // Assert 4: every record (across all trees, INCLUDING the
          // target tree) is byte-for-byte unchanged (Req 5.5).
          // We compare per-tree so a regression that misroutes records
          // surfaces at the tree where it was misrouted.
          // -----------------------------------------------------------
          for (const tree of trees) {
            const expectedPeople = peopleByTreeId.get(tree.id) ?? [];
            const actualPeople = await getPeopleByTree(tree.id);
            expect(sortById(actualPeople)).toEqual(sortById(expectedPeople));

            const expectedUnions = unionsByTreeId.get(tree.id) ?? [];
            const actualUnions = await getUnionsByTree(tree.id);
            expect(sortById(actualUnions)).toEqual(sortById(expectedUnions));

            const expectedLinks = linksByTreeId.get(tree.id) ?? [];
            const actualLinks = await getParentChildLinksByTree(tree.id);
            expect(sortById(actualLinks)).toEqual(sortById(expectedLinks));
          }

          // -----------------------------------------------------------
          // Assert 5: global record totals match the original totals —
          // a stronger invariant than the per-tree reads above (catches
          // any record that drifted to an unrelated `treeId`).
          // -----------------------------------------------------------
          const expectedPeopleTotal = trees.reduce(
            (n, t) => n + (peopleByTreeId.get(t.id)?.length ?? 0),
            0,
          );
          const expectedUnionsTotal = trees.reduce(
            (n, t) => n + (unionsByTreeId.get(t.id)?.length ?? 0),
            0,
          );
          const expectedLinksTotal = trees.reduce(
            (n, t) => n + (linksByTreeId.get(t.id)?.length ?? 0),
            0,
          );
          expect(await db.people.count()).toBe(expectedPeopleTotal);
          expect(await db.unions.count()).toBe(expectedUnionsTotal);
          expect(await db.parentChildLinks.count()).toBe(expectedLinksTotal);
        },
      ),
      { numRuns: 100 },
    );
  });
});
