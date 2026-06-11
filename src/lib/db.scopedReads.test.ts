// Feature: multiple-family-trees, Property 1: Active-tree load isolation
//
// Validates: Requirements 1.3, 3.3, 3.4
//
// For any registry containing multiple trees with their own records, the
// scoped read helpers `getPeopleByTree` / `getUnionsByTree` /
// `getParentChildLinksByTree` return exactly that tree's records and
// exclude every record belonging to any other tree.
//
// Strategy:
//   - Use the singleton `db` (Dexie + fake-indexeddb) and clear all four
//     tables between iterations rather than creating a fresh DB each time.
//     Creating a new Dexie instance per iteration is heavy under
//     fake-indexeddb because it re-runs the `version(2)` upgrade.
//   - Generate ≥2 trees, each carrying its own disjoint set of people /
//     unions / parent-child links (record ids unique across the whole
//     registry; each record's `treeId` points at its owning tree).
//   - Bulk-add the registry into Dexie, then for every tree id:
//       1) assert the returned record-ids equal exactly the seeded
//          record-ids for that tree (set equality);
//       2) assert each returned record matches its seeded counterpart
//          byte-for-byte (structural match);
//       3) assert every returned record carries the queried `treeId`
//          (no record from any other tree leaked into the result).
import { beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  db,
  getParentChildLinksByTree,
  getPeopleByTree,
  getUnionsByTree,
} from './db';
import type {
  Id,
  StoredParentChild,
  StoredPerson,
  StoredUnion,
  Tree,
} from './domain';

// nanoid-like id alphabet — long enough that uniqueArray easily generates
// distinct values, short enough that shrinking is cheap.
const idArb = fc.stringMatching(/^[A-Za-z0-9_-]{12,21}$/);
// Tree display names: 1..50 chars, allowing the spec's full "1..100 chars"
// range without bloating the test data.
const treeNameArb = fc.string({ minLength: 1, maxLength: 50 });

type Bundle = {
  people: StoredPerson[];
  unions: StoredUnion[];
  parentChildLinks: StoredParentChild[];
};

type Registry = {
  trees: Tree[];
  byTreeId: Record<Id, Bundle>;
};

/**
 * Sort an array of records by id so equality comparisons against Dexie
 * results (whose order is unspecified) are deterministic.
 */
function sortById<T extends { id: Id }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.id.localeCompare(b.id));
}

function idsOf<T extends { id: Id }>(arr: T[]): Id[] {
  return arr.map((r) => r.id).sort();
}

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

describe('scoped read isolation across trees (Property 1)', () => {
  beforeEach(async () => {
    // Belt-and-braces — also cleared inside each iteration below.
    await clearAllTables();
  });

  it('getPeopleByTree / getUnionsByTree / getParentChildLinksByTree return only the queried tree\'s records', async () => {
    await fc.assert(
      fc.asyncProperty(fc.gen(), async (g) => {
        // ---------------- registry generation ----------------
        const numTrees = g(() => fc.integer({ min: 2, max: 4 }));

        const treeIds = g(() =>
          fc.uniqueArray(idArb, {
            minLength: numTrees,
            maxLength: numTrees,
          }),
        );

        const trees: Tree[] = treeIds.map((id, i) => ({
          id,
          name: g(() => treeNameArb),
          // Distinct, ordered ISO timestamps so trees have stable identity
          // across shrinking. The actual values are irrelevant to scoped
          // reads, but using the index keeps shrinking deterministic.
          createdAt: new Date(Date.UTC(2024, 0, i + 1)).toISOString(),
        }));

        // Globally unique pool so a record id never collides with a tree
        // id or with another record's id (Dexie primary keys are per-table,
        // but global uniqueness keeps the test's intent obvious).
        const usedIds = new Set<Id>(treeIds);
        const freshId = (): Id => {
          for (let attempt = 0; attempt < 50; attempt++) {
            const candidate = g(() => idArb);
            if (!usedIds.has(candidate)) {
              usedIds.add(candidate);
              return candidate;
            }
          }
          throw new Error('exhausted id-generation attempts');
        };

        const byTreeId: Record<Id, Bundle> = {};
        for (const tree of trees) {
          const numPeople = g(() => fc.integer({ min: 0, max: 4 }));
          const numUnions = g(() => fc.integer({ min: 0, max: 3 }));
          const numLinks = g(() => fc.integer({ min: 0, max: 3 }));

          const people: StoredPerson[] = Array.from(
            { length: numPeople },
            () => ({
              id: freshId(),
              treeId: tree.id,
              givenName: g(() => fc.string({ minLength: 1, maxLength: 20 })),
              familyName: g(() =>
                fc.option(fc.string({ minLength: 0, maxLength: 20 }), {
                  nil: undefined,
                }),
              ),
              createdAt: new Date(Date.UTC(2024, 1, 1)).toISOString(),
              updatedAt: new Date(Date.UTC(2024, 1, 2)).toISOString(),
            }),
          );

          const unions: StoredUnion[] = Array.from(
            { length: numUnions },
            () => ({
              id: freshId(),
              treeId: tree.id,
              partnerIds: g(() =>
                fc.array(idArb, { minLength: 0, maxLength: 2 }),
              ),
              createdAt: new Date(Date.UTC(2024, 2, 1)).toISOString(),
              updatedAt: new Date(Date.UTC(2024, 2, 2)).toISOString(),
            }),
          );

          const parentChildLinks: StoredParentChild[] = Array.from(
            { length: numLinks },
            () => ({
              id: freshId(),
              treeId: tree.id,
              parentIds: g(() =>
                fc.array(idArb, { minLength: 1, maxLength: 2 }),
              ),
              childId: g(() => idArb),
            }),
          );

          byTreeId[tree.id] = { people, unions, parentChildLinks };
        }

        const registry: Registry = { trees, byTreeId };

        // ---------------- seed singleton db ----------------
        await clearAllTables();

        await db.trees.bulkAdd(registry.trees);
        const allPeople = registry.trees.flatMap(
          (t) => registry.byTreeId[t.id].people,
        );
        const allUnions = registry.trees.flatMap(
          (t) => registry.byTreeId[t.id].unions,
        );
        const allLinks = registry.trees.flatMap(
          (t) => registry.byTreeId[t.id].parentChildLinks,
        );
        if (allPeople.length > 0) await db.people.bulkAdd(allPeople);
        if (allUnions.length > 0) await db.unions.bulkAdd(allUnions);
        if (allLinks.length > 0) await db.parentChildLinks.bulkAdd(allLinks);

        // ---------------- assertions ----------------
        for (const tree of registry.trees) {
          const expected = registry.byTreeId[tree.id];
          const [actualPeople, actualUnions, actualLinks] = await Promise.all([
            getPeopleByTree(tree.id),
            getUnionsByTree(tree.id),
            getParentChildLinksByTree(tree.id),
          ]);

          // (1) Set equality by id — returned ids match seeded ids.
          expect(idsOf(actualPeople)).toEqual(idsOf(expected.people));
          expect(idsOf(actualUnions)).toEqual(idsOf(expected.unions));
          expect(idsOf(actualLinks)).toEqual(idsOf(expected.parentChildLinks));

          // (2) Structural match — every field of every record matches the
          // seeded source record byte-for-byte.
          expect(sortById(actualPeople)).toEqual(sortById(expected.people));
          expect(sortById(actualUnions)).toEqual(sortById(expected.unions));
          expect(sortById(actualLinks)).toEqual(
            sortById(expected.parentChildLinks),
          );

          // (3) No records of any other tree leaked into the result.
          for (const r of [...actualPeople, ...actualUnions, ...actualLinks]) {
            expect(r.treeId).toBe(tree.id);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
