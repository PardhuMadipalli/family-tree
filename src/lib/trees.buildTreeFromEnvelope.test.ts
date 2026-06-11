// Feature: multiple-family-trees, Property 16: Import as a new tree is isolated and complete
//
// Validates: Requirements 7.4, 7.5, 7.6
//
// For any valid `SchemaEnvelopeV1` and any `treeId`, `buildTreeFromEnvelope`
// must:
//   * stamp the provided `treeId` on every produced record (people, unions,
//     and parent-child links),
//   * preserve a one-to-one correspondence with the source records by id
//     (no records added, none missing, none duplicated), and
//   * leave every non-`treeId` field byte-for-byte identical to the source
//     record — i.e. dropping `treeId` from any output record reconstructs
//     the original portable record exactly.
//
// This is a pure-function test: no Dexie / IndexedDB involvement. The
// generators produce the portable shapes (`PersonV1` / `UnionV1` /
// `ParentChildV1`) directly, and the assertions read the function's
// in-memory output.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { buildTreeFromEnvelope } from './trees';
import type {
  Id,
  ParentChildV1,
  PersonV1,
  SchemaEnvelopeV1,
  UnionV1,
} from './domain';

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
//
// Ids use a constrained alphabet so `fc.uniqueArray` can produce disjoint
// pools cheaply. Optional fields use `fc.option(..., { nil: undefined })`
// so the property exercises both the "field present" and "field absent"
// branches; the function must preserve the absence of a field as faithfully
// as it preserves a value.

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

function personArb(id: Id): fc.Arbitrary<PersonV1> {
  return fc.record({
    id: fc.constant(id),
    givenName: fc.string({ minLength: 1, maxLength: 30 }),
    familyName: fc.option(fc.string({ minLength: 1, maxLength: 30 }), {
      nil: undefined,
    }),
    birthDate: fc.option(
      fc.constantFrom('1850-08-04', '1990-05-20', '2000-12-25'),
      { nil: undefined },
    ),
    deathDate: fc.option(
      fc.constantFrom('1990-08-04', '2010-06-15', '2020-01-01'),
      { nil: undefined },
    ),
    gender: fc.option(genderArb, { nil: undefined }),
    notes: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
    createdAt: isoTimestampArb,
    updatedAt: isoTimestampArb,
  });
}

function unionArb(id: Id): fc.Arbitrary<UnionV1> {
  return fc.record({
    id: fc.constant(id),
    partnerIds: fc.array(idArb, { minLength: 0, maxLength: 3 }),
    startDate: fc.option(fc.constantFrom('2000-01-01', '2010-06-15'), {
      nil: undefined,
    }),
    endDate: fc.option(fc.constantFrom('2015-12-31', '2020-08-04'), {
      nil: undefined,
    }),
    notes: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
    createdAt: isoTimestampArb,
    updatedAt: isoTimestampArb,
  });
}

function parentChildArb(id: Id): fc.Arbitrary<ParentChildV1> {
  return fc.record({
    id: fc.constant(id),
    parentIds: fc.array(idArb, { minLength: 1, maxLength: 2 }),
    childId: idArb,
  });
}

/** Generates a valid `SchemaEnvelopeV1` whose people/unions/parent-child
 *  ids are pairwise disjoint across the three collections. */
const envelopeArb: fc.Arbitrary<SchemaEnvelopeV1> = fc
  .tuple(
    fc.uniqueArray(idArb, { minLength: 0, maxLength: 6 }),
    fc.uniqueArray(idArb, { minLength: 0, maxLength: 4 }),
    fc.uniqueArray(idArb, { minLength: 0, maxLength: 4 }),
  )
  .map(([pIds, uIds, lIds]) => {
    // Re-uniquify across the three pools so a single id never appears in
    // more than one collection. Per-collection primary keys are unique by
    // construction (each pool is itself a uniqueArray); this extra pass
    // just keeps the test's intent obvious in assertions.
    const seen = new Set<Id>();
    const take = (ids: Id[]): Id[] => {
      const out: Id[] = [];
      for (const id of ids) {
        if (!seen.has(id)) {
          seen.add(id);
          out.push(id);
        }
      }
      return out;
    };
    return {
      peopleIds: take(pIds),
      unionIds: take(uIds),
      linkIds: take(lIds),
    };
  })
  .chain(({ peopleIds, unionIds, linkIds }) =>
    fc.record({
      version: fc.constant(1 as const),
      people: fc.tuple(...peopleIds.map(personArb)),
      unions: fc.tuple(...unionIds.map(unionArb)),
      parentChildLinks: fc.tuple(...linkIds.map(parentChildArb)),
    }),
  );

// `treeId` can be any non-empty string per the domain — we don't constrain
// the format here because `buildTreeFromEnvelope` simply stamps the value
// it is given without validating it.
const treeIdArb = fc.string({ minLength: 1, maxLength: 32 });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip `treeId` so the output record can be compared field-by-field
 *  against its portable source. */
function withoutTreeId<T extends { treeId: Id }>(record: T): Omit<T, 'treeId'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { treeId, ...rest } = record;
  return rest;
}

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('buildTreeFromEnvelope (Property 16)', () => {
  // Property 16: Import as a new tree is isolated and complete
  // For any valid `SchemaEnvelopeV1` and any `treeId`, the output records
  // have `treeId` set on every record, contain exactly the source ids
  // (one-to-one), and every non-`treeId` field equals the source field.
  it('stamps treeId on every record and preserves every other field exactly', () => {
    fc.assert(
      fc.property(envelopeArb, treeIdArb, (envelope, treeId) => {
        const output = buildTreeFromEnvelope(envelope, treeId);

        // (1) treeId is stamped on every produced record.
        for (const r of output.people) expect(r.treeId).toBe(treeId);
        for (const r of output.unions) expect(r.treeId).toBe(treeId);
        for (const r of output.parentChildLinks) expect(r.treeId).toBe(treeId);

        // (2) Output collection sizes equal source collection sizes.
        expect(output.people).toHaveLength(envelope.people.length);
        expect(output.unions).toHaveLength(envelope.unions.length);
        expect(output.parentChildLinks).toHaveLength(
          envelope.parentChildLinks.length,
        );

        // (3) Id sets match the source one-to-one (no ids added, removed,
        //     or duplicated).
        expect(new Set(output.people.map((r) => r.id))).toEqual(
          new Set(envelope.people.map((r) => r.id)),
        );
        expect(new Set(output.unions.map((r) => r.id))).toEqual(
          new Set(envelope.unions.map((r) => r.id)),
        );
        expect(new Set(output.parentChildLinks.map((r) => r.id))).toEqual(
          new Set(envelope.parentChildLinks.map((r) => r.id)),
        );

        // (4) Dropping `treeId` from any output record reconstructs the
        //     source record byte-for-byte.
        for (const original of envelope.people) {
          const after = output.people.find((r) => r.id === original.id)!;
          expect(withoutTreeId(after)).toEqual(original);
        }
        for (const original of envelope.unions) {
          const after = output.unions.find((r) => r.id === original.id)!;
          expect(withoutTreeId(after)).toEqual(original);
        }
        for (const original of envelope.parentChildLinks) {
          const after = output.parentChildLinks.find(
            (r) => r.id === original.id,
          )!;
          expect(withoutTreeId(after)).toEqual(original);
        }
      }),
      { numRuns: 100 },
    );
  });
});
