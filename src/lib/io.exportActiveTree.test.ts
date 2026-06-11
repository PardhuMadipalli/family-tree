// Feature: multiple-family-trees, Property 19: Scoped export exactness
//
// Validates: Requirements 9.1, 9.5
//
// For any registry containing ≥2 trees with disjoint records, exporting any
// chosen tree via `exportActiveTree(treeId)` must produce a valid
// `SchemaEnvelopeV1` whose collections contain exactly that tree's records
// by id (with `treeId` stripped) and exclude every record of any other
// tree. An empty tree exports empty collections (Req 9.5).
//
// Strategy:
//   - Use the singleton `db` (Dexie + fake-indexeddb from the shared test
//     setup) and clear all four tables at the start of every iteration.
//     Creating a fresh Dexie instance per iteration is heavy under
//     fake-indexeddb because it re-runs the `version(2)` upgrade.
//   - Generate ≥2 trees, each carrying its own disjoint set of people /
//     unions / parent-child links. Per-tree counts include 0 to exercise
//     the empty-tree case naturally across the 100 iterations.
//   - Bulk-add the registry to Dexie, then for every tree id:
//       1) call `exportActiveTree(treeId)`,
//       2) assert the result is a valid `SchemaEnvelopeV1` (`version === 1`
//          and `isSchemaEnvelopeV1` accepts it),
//       3) assert each collection's ids are exactly the seeded ids for
//          that tree (one-to-one set equality),
//       4) assert no record in any collection still carries a `treeId`
//          property (the field has been stripped on export),
//       5) assert each output record equals the seeded record minus its
//          `treeId` field byte-for-byte (the portable PersonV1 / UnionV1 /
//          ParentChildV1 shape),
//       6) for trees seeded with zero records, assert all three
//          collections are empty arrays.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { nanoid } from 'nanoid';

import { db } from './db';
import { exportActiveTree, isSchemaEnvelopeV1 } from './io';
import type {
  Id,
  ParentChildV1,
  PersonV1,
  StoredParentChild,
  StoredPerson,
  StoredUnion,
  Tree,
  UnionV1,
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
function sortById<T extends { id: Id }>(xs: readonly T[]): T[] {
  return [...xs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function idsOf<T extends { id: Id }>(xs: readonly T[]): Id[] {
  return xs.map((x) => x.id).sort();
}

/** Strip the `treeId` field from a stored record to recover the portable shape. */
function stripTreeId<T extends { treeId: Id }>(r: T): Omit<T, 'treeId'> {
  // Use destructuring to drop `treeId` cleanly and return everything else
  // exactly as it was stored. This mirrors the production `exportActiveTree`
  // implementation in `io.ts` and is the canonical "portable shape" for
  // round-trip comparison.
  const { treeId: _t, ...rest } = r;
  return rest;
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Per-tree configuration: how many of each record kind the tree owns plus
 * its display name. Counts include 0 so the property naturally exercises
 * the empty-tree case (Req 9.5) across the 100 iterations.
 */
const treeConfigArb = fc.record({
  // The property is about export exactness, not name validation, so any
  // non-empty string is fine for the registry row.
  name: fc.string({ minLength: 1, maxLength: 30 }),
  numPeople: fc.integer({ min: 0, max: 4 }),
  numUnions: fc.integer({ min: 0, max: 3 }),
  numLinks: fc.integer({ min: 0, max: 3 }),
});

/**
 * A whole scenario: at least two trees so "disjoint records across trees"
 * is meaningful, capped at four to keep each iteration fast.
 */
const scenarioArb = fc.array(treeConfigArb, { minLength: 2, maxLength: 4 });

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('exportActiveTree scoped export exactness (Property 19)', () => {
  // Reset before/after the suite so a residual row from a sibling test file
  // (the suite runs all *.test.ts in one process) cannot influence results.
  beforeEach(async () => {
    await clearAllTables();
  });
  afterEach(async () => {
    await clearAllTables();
  });

  it('returns a valid SchemaEnvelopeV1 containing exactly that tree\'s records with treeId stripped', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (treeCfgs) => {
        // fast-check does not run beforeEach between predicate invocations
        // inside a single fc.assert call, so reset the DB at the start of
        // every iteration (matches the pattern used by the other db.*
        // property tests in this folder).
        await clearAllTables();

        // -------------------------------------------------------------
        // Build the in-memory expectation: trees + per-tree records.
        // Stable, unique ids come from nanoid so record ids never
        // collide across trees, which makes the disjointness assertion
        // below meaningful.
        // -------------------------------------------------------------
        const trees: Tree[] = [];
        const peopleByTreeId = new Map<Id, StoredPerson[]>();
        const unionsByTreeId = new Map<Id, StoredUnion[]>();
        const linksByTreeId = new Map<Id, StoredParentChild[]>();

        treeCfgs.forEach((cfg, treeIdx) => {
          const tree: Tree = {
            id: nanoid(),
            name: cfg.name,
            // Distinct timestamps per tree so the registry has a well
            // defined order; trees table is keyed by `id` so this is
            // only for human-readable assertions if a counter-example
            // surfaces.
            createdAt: new Date(2020, 0, 1 + treeIdx).toISOString(),
          };
          trees.push(tree);

          const people: StoredPerson[] = Array.from(
            { length: cfg.numPeople },
            (_, i) => ({
              id: nanoid(),
              treeId: tree.id,
              givenName: `p${treeIdx}-${i}`,
              familyName: `fam${treeIdx}`,
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
            () => ({
              id: nanoid(),
              treeId: tree.id,
              parentIds: [nanoid()],
              childId: nanoid(),
            }),
          );
          linksByTreeId.set(tree.id, links);
        });

        // -------------------------------------------------------------
        // Persist everything to Dexie in a single rw transaction so the
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
        // For every tree, export it and assert exactness.
        // -------------------------------------------------------------
        for (const tree of trees) {
          const expectedPeople = peopleByTreeId.get(tree.id) ?? [];
          const expectedUnions = unionsByTreeId.get(tree.id) ?? [];
          const expectedLinks = linksByTreeId.get(tree.id) ?? [];

          const envelope = await exportActiveTree(tree.id);

          // (1) Result is a valid SchemaEnvelopeV1.
          expect(isSchemaEnvelopeV1(envelope)).toBe(true);
          expect(envelope.version).toBe(1);

          // (2) Set equality by id — collections contain exactly the
          //     seeded ids for that tree, no more and no fewer.
          expect(idsOf(envelope.people)).toEqual(idsOf(expectedPeople));
          expect(idsOf(envelope.unions)).toEqual(idsOf(expectedUnions));
          expect(idsOf(envelope.parentChildLinks)).toEqual(
            idsOf(expectedLinks),
          );

          // (3) `treeId` is stripped from every exported record. The
          //     portable shapes (PersonV1 / UnionV1 / ParentChildV1)
          //     intentionally do not carry a treeId.
          for (const r of envelope.people as Array<PersonV1 & { treeId?: Id }>) {
            expect('treeId' in r).toBe(false);
          }
          for (const r of envelope.unions as Array<UnionV1 & { treeId?: Id }>) {
            expect('treeId' in r).toBe(false);
          }
          for (const r of envelope.parentChildLinks as Array<
            ParentChildV1 & { treeId?: Id }
          >) {
            expect('treeId' in r).toBe(false);
          }

          // (4) Byte-for-byte structural match against the seeded
          //     records minus their `treeId` field. This is the
          //     "portable shape preserved exactly" assertion.
          expect(sortById(envelope.people)).toEqual(
            sortById(expectedPeople.map(stripTreeId)),
          );
          expect(sortById(envelope.unions)).toEqual(
            sortById(expectedUnions.map(stripTreeId)),
          );
          expect(sortById(envelope.parentChildLinks)).toEqual(
            sortById(expectedLinks.map(stripTreeId)),
          );

          // (5) Disjointness — no id from any other tree leaks into
          //     this tree's export. Combined with (2) above, this is
          //     the "exclude every record of any other tree" clause.
          const otherIds = new Set<Id>();
          for (const other of trees) {
            if (other.id === tree.id) continue;
            for (const r of peopleByTreeId.get(other.id) ?? []) otherIds.add(r.id);
            for (const r of unionsByTreeId.get(other.id) ?? []) otherIds.add(r.id);
            for (const r of linksByTreeId.get(other.id) ?? []) otherIds.add(r.id);
          }
          for (const r of envelope.people) expect(otherIds.has(r.id)).toBe(false);
          for (const r of envelope.unions) expect(otherIds.has(r.id)).toBe(false);
          for (const r of envelope.parentChildLinks) {
            expect(otherIds.has(r.id)).toBe(false);
          }

          // (6) Empty-tree case (Req 9.5): when the tree was seeded
          //     with no records, the exported envelope's collections
          //     are all empty arrays.
          if (
            expectedPeople.length === 0 &&
            expectedUnions.length === 0 &&
            expectedLinks.length === 0
          ) {
            expect(envelope.people).toEqual([]);
            expect(envelope.unions).toEqual([]);
            expect(envelope.parentChildLinks).toEqual([]);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
