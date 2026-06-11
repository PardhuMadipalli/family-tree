// Feature: multiple-family-trees, Property 14: Migration preserves all data
//
// Validates: Requirements 8.1, 8.3, 8.4
//
// For any set of pre-existing v1 records (people / unions / parent-child
// links) without a `treeId`, opening the DB at v2 must atomically:
//   * create exactly one Default_Tree named DEFAULT_TREE_NAME (when there is
//     at least one legacy record),
//   * stamp every legacy record's `treeId` with the new Default_Tree's id,
//   * preserve every other field of every record byte-for-byte, and
//   * neither add nor remove any record.
//
// The test drives Dexie directly (rather than the production
// `FamilyTreeDB` class with its hardcoded name) so each property iteration
// can use a unique DB name. `fake-indexeddb/auto` shares a single global
// registry across the test process, so reusing a name between iterations
// would leak state from one run into the next.
//
// Iteration count: 100 full open/migrate cycles under fake-indexeddb runs
// well within Vitest's default timeout, so we use the spec's recommended
// minimum of 100.
import { afterEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import Dexie from 'dexie';
import { nanoid } from 'nanoid';

import {
  DEFAULT_TREE_NAME,
  type ParentChildV1,
  type PersonV1,
  type Tree,
  type UnionV1,
} from './domain';
import { migrateLegacyRecordsToDefaultTree } from './db';

// ---------------------------------------------------------------------------
// Generators for the v1 portable record shapes (no `treeId`).
//
// Ids are constrained to a stable shape so unique-array generation is
// deterministic. Optional fields use `fc.option(..., { nil: undefined })`
// so the test exercises both "field present" and "field absent" branches —
// IndexedDB structured-clone normalizes explicit `undefined` to "missing"
// on read, and `toEqual` treats the two as equivalent.
// ---------------------------------------------------------------------------

const idArb = fc.stringMatching(/^[A-Za-z0-9_-]{8,16}$/);

const isoTimestampArb = fc
  .integer({ min: 0, max: 4_102_444_800_000 }) // 1970..2100
  .map((ms) => new Date(ms).toISOString());

const genderArb = fc.constantFrom<PersonV1['gender']>(
  'male',
  'female',
  'other',
  'unknown',
);

function personArb(id: string): fc.Arbitrary<PersonV1> {
  return fc.record({
    id: fc.constant(id),
    givenName: fc.string({ minLength: 1, maxLength: 30 }),
    familyName: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
    birthDate: fc.option(fc.constantFrom('1850-08-04', '1990-05-20', '2000-12-25'), { nil: undefined }),
    deathDate: fc.option(fc.constantFrom('1990-08-04', '2010-06-15', '2020-01-01'), { nil: undefined }),
    gender: fc.option(genderArb, { nil: undefined }),
    notes: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
    createdAt: isoTimestampArb,
    updatedAt: isoTimestampArb,
  });
}

function unionArb(id: string): fc.Arbitrary<UnionV1> {
  return fc.record({
    id: fc.constant(id),
    partnerIds: fc.array(idArb, { minLength: 0, maxLength: 3 }),
    startDate: fc.option(fc.constantFrom('2000-01-01', '2010-06-15'), { nil: undefined }),
    endDate: fc.option(fc.constantFrom('2015-12-31', '2020-08-04'), { nil: undefined }),
    notes: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
    createdAt: isoTimestampArb,
    updatedAt: isoTimestampArb,
  });
}

function parentChildArb(id: string): fc.Arbitrary<ParentChildV1> {
  return fc.record({
    id: fc.constant(id),
    parentIds: fc.array(idArb, { minLength: 1, maxLength: 2 }),
    childId: idArb,
  });
}

/** Generates a v1 dataset with disjoint id sets across the three tables. */
const v1DatasetArb = fc
  .tuple(
    fc.uniqueArray(idArb, { minLength: 0, maxLength: 6 }),
    fc.uniqueArray(idArb, { minLength: 0, maxLength: 4 }),
    fc.uniqueArray(idArb, { minLength: 0, maxLength: 4 }),
  )
  // Concatenate all three id pools and re-uniquify so people/unions/links
  // never collide on id (Dexie keys by primary id within each store, but
  // we keep ids globally unique for cleaner assertions on identity).
  .map(([pIds, uIds, lIds]) => {
    const seen = new Set<string>();
    const take = (ids: string[]): string[] => {
      const out: string[] = [];
      for (const id of ids) {
        if (!seen.has(id)) {
          seen.add(id);
          out.push(id);
        }
      }
      return out;
    };
    return { peopleIds: take(pIds), unionIds: take(uIds), linkIds: take(lIds) };
  })
  .chain(({ peopleIds, unionIds, linkIds }) =>
    fc.record({
      people: fc.tuple(...peopleIds.map(personArb)),
      unions: fc.tuple(...unionIds.map(unionArb)),
      parentChildLinks: fc.tuple(...linkIds.map(parentChildArb)),
    }),
  );

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const V1_STORES = {
  people: 'id, givenName, familyName, createdAt, updatedAt',
  unions: 'id, createdAt, updatedAt',
  parentChildLinks: 'id, childId',
} as const;

const V2_STORES = {
  trees: 'id, createdAt',
  people: 'id, treeId, givenName, familyName, createdAt, updatedAt',
  unions: 'id, treeId, createdAt, updatedAt',
  parentChildLinks: 'id, treeId, childId',
} as const;

/** Strip `treeId` so the post-migration record can be compared field-by-field
 *  against the original v1 input. */
function withoutTreeId<T extends { treeId?: string }>(record: T): Omit<T, 'treeId'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { treeId, ...rest } = record;
  return rest;
}

// Track DB names created during the test run so they can be deleted in
// `afterEach` even if a property iteration aborts before its own cleanup.
const createdDbNames: string[] = [];

afterEach(async () => {
  while (createdDbNames.length > 0) {
    const name = createdDbNames.pop()!;
    try {
      await Dexie.delete(name);
    } catch {
      // best-effort cleanup; fake-indexeddb may already have dropped it
    }
  }
});

describe('migrateLegacyRecordsToDefaultTree (v1 -> v2)', () => {
  // Property 14: Migration preserves all data
  // For any set of pre-existing v1 records, opening the DB at v2 stamps
  // exactly the new treeId on every record, preserves every other field,
  // and adds/removes no records.
  it('stamps treeId on every v1 record while preserving every other field', async () => {
    await fc.assert(
      fc.asyncProperty(v1DatasetArb, async (dataset) => {
        const dbName = `family-tree-migration-test-${nanoid()}`;
        createdDbNames.push(dbName);

        // 1. Open at v1 with the original schema and seed the legacy data.
        //    These records intentionally have no `treeId` field.
        const v1 = new Dexie(dbName);
        v1.version(1).stores(V1_STORES);
        await v1.open();
        if (dataset.people.length > 0) {
          await v1.table('people').bulkAdd(dataset.people);
        }
        if (dataset.unions.length > 0) {
          await v1.table('unions').bulkAdd(dataset.unions);
        }
        if (dataset.parentChildLinks.length > 0) {
          await v1.table('parentChildLinks').bulkAdd(dataset.parentChildLinks);
        }
        v1.close();

        // 2. Reopen with both schema versions declared so Dexie runs the
        //    v2 upgrade, which delegates to the production migration helper.
        const v2 = new Dexie(dbName);
        v2.version(1).stores(V1_STORES);
        v2
          .version(2)
          .stores(V2_STORES)
          .upgrade(async (tx) => {
            await migrateLegacyRecordsToDefaultTree(tx);
          });
        await v2.open();

        // 3. Read every store post-migration.
        const treesAfter = (await v2.table('trees').toArray()) as Tree[];
        const peopleAfter = await v2.table('people').toArray();
        const unionsAfter = await v2.table('unions').toArray();
        const linksAfter = await v2.table('parentChildLinks').toArray();

        const totalLegacy =
          dataset.people.length +
          dataset.unions.length +
          dataset.parentChildLinks.length;

        if (totalLegacy === 0) {
          // No legacy records → migration must NOT create a Default_Tree.
          // Bootstrap is the layer that creates the first tree on truly
          // empty registries; the upgrade itself stays a no-op.
          expect(treesAfter).toHaveLength(0);
        } else {
          // Exactly one Default_Tree was created with the canonical name.
          expect(treesAfter).toHaveLength(1);
          expect(treesAfter[0].name).toBe(DEFAULT_TREE_NAME);
          expect(typeof treesAfter[0].id).toBe('string');
          expect(treesAfter[0].id.length).toBeGreaterThan(0);

          const defaultTreeId = treesAfter[0].id;

          // Every migrated record's treeId references the Default_Tree.
          for (const r of peopleAfter) expect(r.treeId).toBe(defaultTreeId);
          for (const r of unionsAfter) expect(r.treeId).toBe(defaultTreeId);
          for (const r of linksAfter) expect(r.treeId).toBe(defaultTreeId);
        }

        // No record was added or removed in any of the three stores.
        expect(peopleAfter).toHaveLength(dataset.people.length);
        expect(unionsAfter).toHaveLength(dataset.unions.length);
        expect(linksAfter).toHaveLength(dataset.parentChildLinks.length);

        // Every original id is still present (and only those ids).
        expect(new Set(peopleAfter.map((r) => r.id))).toEqual(
          new Set(dataset.people.map((r) => r.id)),
        );
        expect(new Set(unionsAfter.map((r) => r.id))).toEqual(
          new Set(dataset.unions.map((r) => r.id)),
        );
        expect(new Set(linksAfter.map((r) => r.id))).toEqual(
          new Set(dataset.parentChildLinks.map((r) => r.id)),
        );

        // Every non-treeId field is byte-for-byte equal to the v1 input.
        for (const original of dataset.people) {
          const after = peopleAfter.find((r) => r.id === original.id)!;
          expect(withoutTreeId(after)).toEqual(original);
        }
        for (const original of dataset.unions) {
          const after = unionsAfter.find((r) => r.id === original.id)!;
          expect(withoutTreeId(after)).toEqual(original);
        }
        for (const original of dataset.parentChildLinks) {
          const after = linksAfter.find((r) => r.id === original.id)!;
          expect(withoutTreeId(after)).toEqual(original);
        }

        // Close and drop the per-iteration DB so the next iteration starts
        // from a clean slate even before the afterEach cleanup runs.
        v2.close();
        await Dexie.delete(dbName);
        // Pop the name we just deleted so afterEach doesn't try again.
        const idx = createdDbNames.indexOf(dbName);
        if (idx >= 0) createdDbNames.splice(idx, 1);
      }),
      { numRuns: 100 },
    );
  });
});
