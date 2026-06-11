// Feature: multiple-family-trees, Property 15: Migration is idempotent
//
// Validates: Requirements 8.5
//
// For any database on which the v1 -> v2 migration has already completed,
// running the startup bootstrap (i.e., opening the same DB at v2) again
// MUST create no additional Default_Tree and MUST duplicate no records.
//
// The property is enforced by Dexie's contract: it persists the installed
// schema version, so the `version(2).upgrade` callback runs at most once
// per browser DB. This test exercises that guarantee end-to-end by:
//   1. Seeding a v1 DB with arbitrary unstamped people / unions / links.
//   2. Opening the same DB at v2 (first migration) and snapshotting state.
//   3. Closing and reopening at v2 a second time (must be a no-op).
//   4. Closing and reopening at v2 a third time (still a no-op).
//   5. Asserting the trees / people / unions / links collections at runs
//      2 and 3 are byte-for-byte equal to the run-1 snapshot — same ids,
//      same `treeId`s, same field values, same counts.
//
// Each iteration uses a unique DB name so state from a previous iteration
// cannot leak forward and silently mask a regression.

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import Dexie from 'dexie';
import { nanoid } from 'nanoid';

import { migrateLegacyRecordsToDefaultTree } from './db';

// --- helpers --------------------------------------------------------------

/**
 * Open a fresh Dexie DB at the given name with the original v1 single-tree
 * schema. Used to seed pre-multi-tree records before the v2 upgrade.
 */
function openV1(name: string): Dexie {
  const db = new Dexie(name);
  db.version(1).stores({
    people: 'id, givenName, familyName, createdAt, updatedAt',
    unions: 'id, createdAt, updatedAt',
    parentChildLinks: 'id, childId',
  });
  return db;
}

/**
 * Open a Dexie DB at the given name with the same version chain and
 * `migrateLegacyRecordsToDefaultTree` upgrade hook used by the production
 * `FamilyTreeDB`. Mirrors `db.ts` exactly; only the DB name differs so
 * each property iteration is isolated.
 */
function openV2(name: string): Dexie {
  const db = new Dexie(name);
  db.version(1).stores({
    people: 'id, givenName, familyName, createdAt, updatedAt',
    unions: 'id, createdAt, updatedAt',
    parentChildLinks: 'id, childId',
  });
  db.version(2)
    .stores({
      trees: 'id, createdAt',
      people: 'id, treeId, givenName, familyName, createdAt, updatedAt',
      unions: 'id, treeId, createdAt, updatedAt',
      parentChildLinks: 'id, treeId, childId',
    })
    .upgrade(async (tx) => {
      await migrateLegacyRecordsToDefaultTree(tx);
    });
  return db;
}

interface Snapshot {
  trees: Array<Record<string, unknown>>;
  people: Array<Record<string, unknown>>;
  unions: Array<Record<string, unknown>>;
  parentChildLinks: Array<Record<string, unknown>>;
}

/**
 * Read every row of every table and return a deterministically-ordered
 * snapshot so cross-snapshot equality compares set-style (independent of
 * the underlying iteration order).
 */
async function snapshot(db: Dexie): Promise<Snapshot> {
  const [trees, people, unions, parentChildLinks] = await Promise.all([
    db.table('trees').toArray(),
    db.table('people').toArray(),
    db.table('unions').toArray(),
    db.table('parentChildLinks').toArray(),
  ]);
  const byId = (a: { id: string }, b: { id: string }) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  return {
    trees: trees.slice().sort(byId),
    people: people.slice().sort(byId),
    unions: unions.slice().sort(byId),
    parentChildLinks: parentChildLinks.slice().sort(byId),
  };
}

// --- arbitraries ----------------------------------------------------------

const isoArb = fc.constantFrom(
  '2023-01-01T00:00:00.000Z',
  '2024-06-15T12:34:56.789Z',
  '2025-12-31T23:59:59.999Z',
);

// Nanoid-shaped ids; the alphabet matches what the app actually generates.
const idArb = fc.stringMatching(/^[A-Za-z0-9_-]{6,21}$/);

const personArb = fc.record({
  id: idArb,
  givenName: fc.string({ minLength: 1, maxLength: 20 }),
  familyName: fc.string({ minLength: 0, maxLength: 20 }),
  gender: fc.constantFrom('male', 'female', 'other', 'unknown'),
  notes: fc.string({ minLength: 0, maxLength: 30 }),
  createdAt: isoArb,
  updatedAt: isoArb,
});

const unionArb = fc.record({
  id: idArb,
  partnerIds: fc.array(idArb, { minLength: 0, maxLength: 3 }),
  notes: fc.string({ minLength: 0, maxLength: 30 }),
  createdAt: isoArb,
  updatedAt: isoArb,
});

const linkArb = fc.record({
  id: idArb,
  parentIds: fc.array(idArb, { minLength: 1, maxLength: 2 }),
  childId: idArb,
});

// --- property -------------------------------------------------------------

describe('Property 15: Migration is idempotent', () => {
  // numRuns chosen at 100. Each iteration drives Dexie through a v1 seed
  // and three full v2 open/close cycles plus a `Dexie.delete` of the
  // underlying IDB — by far the most expensive shape of property in the
  // suite. The whole property still completes in well under a second
  // against `fake-indexeddb`, so the higher run count is preferred for the
  // additional input-space coverage (empty-legacy, single-record, and
  // multi-record shapes plus boundary mixtures of the three tables). The
  // task allows ≥ 30; 100 is used because performance allows it.
  const NUM_RUNS = 100;

  it(
    'reopening the migrated DB twice more creates no extra Default_Tree and no duplicate records',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uniqueArray(personArb, { selector: (p) => p.id, maxLength: 5 }),
          fc.uniqueArray(unionArb, { selector: (u) => u.id, maxLength: 5 }),
          fc.uniqueArray(linkArb, { selector: (l) => l.id, maxLength: 5 }),
          async (people, unions, links) => {
            // Per-iteration unique DB name so state cannot leak between
            // iterations of the same property — `fake-indexeddb/auto` keeps
            // databases in memory keyed by name across the whole test
            // process.
            const dbName = `family-tree-db-property-15-${nanoid()}`;

            try {
              // 1. Seed at v1 (pre-multi-tree shape: no `treeId` on any row).
              const v1 = openV1(dbName);
              try {
                if (people.length) await v1.table('people').bulkAdd(people);
                if (unions.length) await v1.table('unions').bulkAdd(unions);
                if (links.length)
                  await v1.table('parentChildLinks').bulkAdd(links);
              } finally {
                v1.close();
              }

              // 2. First v2 open — `version(2).upgrade` runs the migration.
              const firstOpen = openV2(dbName);
              let firstSnapshot: Snapshot;
              try {
                firstSnapshot = await snapshot(firstOpen);
              } finally {
                firstOpen.close();
              }

              // Sanity-check the migration actually produced the shape we
              // expect to compare against, so run-2 / run-3 equality isn't
              // trivially satisfied by an empty pre-state on both sides.
              const seededAny =
                people.length + unions.length + links.length > 0;
              if (seededAny) {
                // Migration must create exactly one Default_Tree.
                expect(firstSnapshot.trees).toHaveLength(1);
              } else {
                // No legacy data → migration returns without creating a tree.
                expect(firstSnapshot.trees).toHaveLength(0);
              }

              // 3. Second v2 open — Dexie persists schema version, so the
              //    upgrade callback MUST NOT run again.
              const secondOpen = openV2(dbName);
              let secondSnapshot: Snapshot;
              try {
                secondSnapshot = await snapshot(secondOpen);
              } finally {
                secondOpen.close();
              }

              // 4. Third v2 open — still a no-op.
              const thirdOpen = openV2(dbName);
              let thirdSnapshot: Snapshot;
              try {
                thirdSnapshot = await snapshot(thirdOpen);
              } finally {
                thirdOpen.close();
              }

              // No additional Default_Tree on either subsequent open.
              expect(secondSnapshot.trees).toEqual(firstSnapshot.trees);
              expect(thirdSnapshot.trees).toEqual(firstSnapshot.trees);

              // No record duplicated, every id and treeId unchanged across
              // all three opens — the strongest possible statement of "the
              // migration is idempotent".
              expect(secondSnapshot.people).toEqual(firstSnapshot.people);
              expect(secondSnapshot.unions).toEqual(firstSnapshot.unions);
              expect(secondSnapshot.parentChildLinks).toEqual(
                firstSnapshot.parentChildLinks,
              );
              expect(thirdSnapshot.people).toEqual(firstSnapshot.people);
              expect(thirdSnapshot.unions).toEqual(firstSnapshot.unions);
              expect(thirdSnapshot.parentChildLinks).toEqual(
                firstSnapshot.parentChildLinks,
              );
            } finally {
              // Free the underlying IDB so the in-memory `fake-indexeddb`
              // store stays bounded across the property's iterations even
              // when an assertion failure shrinks for many runs.
              await Dexie.delete(dbName);
            }
          },
        ),
        { numRuns: NUM_RUNS },
      );
    },
  );
});
