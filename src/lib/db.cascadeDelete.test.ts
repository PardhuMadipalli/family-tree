// Feature: multiple-family-trees, Property 4: Cascade delete isolation
//
// Validates: Requirements 1.7, 6.2, 6.5
//
// For any registry with N (>= 2) trees each owning M (>= 0) records,
// deleting one chosen tree via `deleteTreeCascade` must:
//   - remove that tree's row from the `trees` table, and
//   - remove exactly the records (people / unions / parent-child links)
//     associated with that tree's id, and
//   - leave every other tree's row and records byte-for-byte unchanged.
//
// The test drives the production `deleteTreeCascade` implementation in
// `db.ts` against the singleton `db` instance, backed by `fake-indexeddb`
// from the shared test setup. Per the task notes (approach c) every
// iteration first clears the four tables so each generated input runs
// against a known-empty registry.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { nanoid } from 'nanoid';

import {
  db,
  deleteTreeCascade,
  getParentChildLinksByTree,
  getPeopleByTree,
  getUnionsByTree,
} from './db';
import type {
  StoredParentChild,
  StoredPerson,
  StoredUnion,
  Tree,
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

/** Stable sort by `id` so two record sets can be compared with `toEqual`. */
function sortById<T extends { id: string }>(xs: readonly T[]): T[] {
  return [...xs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Per-tree configuration: how many of each record kind the tree owns plus
 * its display name. Counts are bounded to keep each iteration fast under
 * fake-indexeddb while still exercising the M=0 edge case (an empty tree).
 */
const treeConfigArb = fc.record({
  // `name` only needs to be a string for storage purposes here — the
  // property is about cascade isolation, not name validation. A short
  // unicode string keeps the generator cheap and shrinks well.
  name: fc.string({ minLength: 1, maxLength: 30 }),
  numPeople: fc.integer({ min: 0, max: 3 }),
  numUnions: fc.integer({ min: 0, max: 3 }),
  numLinks: fc.integer({ min: 0, max: 3 }),
});

/**
 * A whole scenario: at least two trees (so "isolation" is meaningful), plus
 * a `deleteOffset` we mod by `trees.length` to choose which tree to delete.
 * Generating the offset as an unbounded non-negative int avoids `fc.chain`
 * and shrinks cleanly even when the tree array shrinks.
 */
const scenarioArb = fc.record({
  trees: fc.array(treeConfigArb, { minLength: 2, maxLength: 4 }),
  deleteOffset: fc.nat({ max: 1_000 }),
});

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('deleteTreeCascade isolation', () => {
  // Reset the DB before and after the suite so a residual row from a
  // previous test file (e.g. activeTreePointer.test.ts shares the suite
  // process) cannot influence the result.
  beforeEach(async () => {
    await clearAllTables();
  });
  afterEach(async () => {
    await clearAllTables();
  });

  // Property 4: Cascade delete isolation
  // Generate a registry with N trees each owning M records; pick one tree,
  // call deleteTreeCascade; assert that tree's row and exactly its records
  // are removed and every other tree's row and records are unchanged.
  it('removes target tree and exactly its records, preserving every other tree', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ trees: treeCfgs, deleteOffset }) => {
        // fast-check does not run beforeEach between predicate invocations
        // inside a single fc.assert call, so reset the DB at the start of
        // every iteration (this matches activeTreePointer.test.ts).
        await clearAllTables();

        // -------------------------------------------------------------
        // Build the in-memory expectation: trees + per-tree records.
        // Stable, unique ids come from nanoid; createdAt is offset per
        // tree so the registry has a deterministic ordering.
        // -------------------------------------------------------------
        const trees: Tree[] = [];
        const peopleByTreeId = new Map<string, StoredPerson[]>();
        const unionsByTreeId = new Map<string, StoredUnion[]>();
        const linksByTreeId = new Map<string, StoredParentChild[]>();

        treeCfgs.forEach((cfg, treeIdx) => {
          const tree: Tree = {
            id: nanoid(),
            name: cfg.name,
            // Distinct timestamps per tree so the registry has a well
            // defined order; avoids accidentally aliasing two trees by
            // identical createdAt values (the `trees` table is keyed by
            // `id` so duplicates would not collide on the primary key,
            // but distinct timestamps make assertions easier to reason
            // about).
            createdAt: new Date(2020, 0, 1 + treeIdx).toISOString(),
          };
          trees.push(tree);

          const people: StoredPerson[] = Array.from({ length: cfg.numPeople }, (_, i) => ({
            id: nanoid(),
            treeId: tree.id,
            givenName: `p${treeIdx}-${i}`,
            createdAt: '2020-01-01T00:00:00.000Z',
            updatedAt: '2020-01-01T00:00:00.000Z',
          }));
          peopleByTreeId.set(tree.id, people);

          const unions: StoredUnion[] = Array.from({ length: cfg.numUnions }, (_, i) => ({
            id: nanoid(),
            treeId: tree.id,
            partnerIds: [nanoid(), nanoid()],
            notes: `u${treeIdx}-${i}`,
            createdAt: '2020-01-01T00:00:00.000Z',
            updatedAt: '2020-01-01T00:00:00.000Z',
          }));
          unionsByTreeId.set(tree.id, unions);

          const links: StoredParentChild[] = Array.from({ length: cfg.numLinks }, (_, _i) => ({
            id: nanoid(),
            treeId: tree.id,
            parentIds: [nanoid()],
            childId: nanoid(),
          }));
          linksByTreeId.set(tree.id, links);
        });

        // -------------------------------------------------------------
        // Persist everything to Dexie in a single rw transaction so
        // setup is atomic and fast.
        // -------------------------------------------------------------
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

        // -------------------------------------------------------------
        // Pick exactly one tree to delete; the others must survive.
        // -------------------------------------------------------------
        const targetIdx = deleteOffset % trees.length;
        const target = trees[targetIdx];
        const others = trees.filter((_, i) => i !== targetIdx);

        // -------------------------------------------------------------
        // Act: cascade delete the chosen tree.
        // -------------------------------------------------------------
        await deleteTreeCascade(target.id);

        // -------------------------------------------------------------
        // Assert 1: target tree row is gone.
        // -------------------------------------------------------------
        expect(await db.trees.get(target.id)).toBeUndefined();

        // Assert 2: target tree's records are gone, both via scoped
        // reads (Req 1.3 / 1.7) and via raw existence checks (no record
        // anywhere in any record table still carries the target's id).
        expect(await getPeopleByTree(target.id)).toEqual([]);
        expect(await getUnionsByTree(target.id)).toEqual([]);
        expect(await getParentChildLinksByTree(target.id)).toEqual([]);
        expect(
          await db.people.where('treeId').equals(target.id).count(),
        ).toBe(0);
        expect(
          await db.unions.where('treeId').equals(target.id).count(),
        ).toBe(0);
        expect(
          await db.parentChildLinks.where('treeId').equals(target.id).count(),
        ).toBe(0);

        // Assert 3: every other tree's registry row is present and
        // unchanged. We compare the full stored row (id, name,
        // createdAt) so any silent mutation would surface here.
        const remainingTrees = await db.trees.toArray();
        expect(remainingTrees).toHaveLength(others.length);
        expect(sortById(remainingTrees)).toEqual(sortById(others));

        // Assert 4: every other tree's records are present and
        // byte-for-byte unchanged. Cascade deletion must not touch any
        // record outside the targeted tree (Req 1.7, 6.5).
        for (const otherTree of others) {
          const expectedPeople = peopleByTreeId.get(otherTree.id) ?? [];
          const actualPeople = await getPeopleByTree(otherTree.id);
          expect(sortById(actualPeople)).toEqual(sortById(expectedPeople));

          const expectedUnions = unionsByTreeId.get(otherTree.id) ?? [];
          const actualUnions = await getUnionsByTree(otherTree.id);
          expect(sortById(actualUnions)).toEqual(sortById(expectedUnions));

          const expectedLinks = linksByTreeId.get(otherTree.id) ?? [];
          const actualLinks = await getParentChildLinksByTree(otherTree.id);
          expect(sortById(actualLinks)).toEqual(sortById(expectedLinks));
        }

        // Assert 5: the surviving record totals across all tables match
        // the sum of the others' counts (a stronger global invariant
        // than the per-tree reads above).
        const expectedPeopleTotal = others.reduce(
          (n, t) => n + (peopleByTreeId.get(t.id)?.length ?? 0),
          0,
        );
        const expectedUnionsTotal = others.reduce(
          (n, t) => n + (unionsByTreeId.get(t.id)?.length ?? 0),
          0,
        );
        const expectedLinksTotal = others.reduce(
          (n, t) => n + (linksByTreeId.get(t.id)?.length ?? 0),
          0,
        );
        expect(await db.people.count()).toBe(expectedPeopleTotal);
        expect(await db.unions.count()).toBe(expectedUnionsTotal);
        expect(await db.parentChildLinks.count()).toBe(expectedLinksTotal);
      }),
      { numRuns: 100 },
    );
  });
});
