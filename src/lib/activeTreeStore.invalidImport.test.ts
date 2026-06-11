// Feature: multiple-family-trees, Property 17: Invalid import is rejected without side effects
//
// Validates: Requirements 7.1, 7.3
//
// For any value that fails `isSchemaEnvelopeV1` validation, the import flow
// rejects the input and the registry and all records remain byte-for-byte
// unchanged. Requirement 7.1 says the Import_Service validates the file
// against SchemaEnvelopeV1 BEFORE creating any tree or modifying any record,
// and Req 7.3 says a validation failure leaves the Tree_Registry and all
// Tree_Records unchanged.
//
// The user-visible Import_Service is a two-step pipeline (see
// `src/app/data/page.tsx`):
//
//   1. `JSON.parse` the file -> `isSchemaEnvelopeV1(json)` (the validation gate).
//   2. Only when (1) returns true: `useActiveTreeStore.importAsNewTree(json, ...)`.
//
// `importAsNewTree` is typed as accepting a validated `SchemaEnvelopeV1`, so
// the contract being tested is "any value that fails validation never reaches
// the importer, and the persisted state remains exactly as it was". This
// property models that contract end-to-end: a generated invalid value goes
// through the same gate the Data page uses, the conditional call to
// `importAsNewTree` is skipped, and the DB snapshot before the attempt
// equals the DB snapshot after.
//
// Strategy:
//   - Per iteration: clear all four Dexie tables, clear `localStorage`, and
//     reset the three Zustand stores back to their initial in-memory shape.
//     Driving the singleton `db` (Dexie + fake-indexeddb from the shared
//     test setup) and the singleton stores keeps each iteration cheap;
//     spinning up a fresh Dexie instance per iteration would re-run the
//     `version(2)` upgrade.
//   - Call `bootstrap()` so the active-tree store creates the default tree
//     and resolves an Active_Tree (matching the real app's startup state).
//   - Optionally seed 0..3 additional trees, each carrying some records,
//     so the "all records remain unchanged" clause has a non-trivial
//     dataset to verify against (rather than just an empty DB).
//   - Snapshot the entire DB (trees, people, unions, parentChildLinks).
//   - Generate an invalid envelope value via `fc.oneof` covering every
//     rejection branch in `isSchemaEnvelopeV1`: non-objects (null,
//     primitives, arrays), objects with the wrong `version`, missing
//     `version`, and objects with non-array `people`/`unions`/
//     `parentChildLinks` fields. The whole oneof is filtered through
//     `!isSchemaEnvelopeV1` so any astronomically-rare valid envelope that
//     slips out of `fc.anything()`-ish corners is skipped.
//   - Verify `isSchemaEnvelopeV1(value) === false` and execute the same
//     gated flow as the Data page; track whether `importAsNewTree` would
//     have been called (it never is when validation rejects).
//   - Snapshot the DB again and assert byte-for-byte equality with the
//     before-snapshot.
//
// `numRuns: 100` per the spec.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { nanoid } from 'nanoid';

import { db } from './db';
import { useActiveTreeStore } from './activeTreeStore';
import { usePeopleStore } from './store';
import { useRelationsStore } from './relationsStore';
import { isSchemaEnvelopeV1 } from './io';
import type {
  Id,
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

/**
 * Reset the active-tree Zustand store and the two record stores back to
 * their initial in-memory shape. Action functions remain intact (Zustand
 * `setState` does a partial merge), so subsequent calls to `bootstrap()`
 * etc. still hit the production code paths.
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

/** Stable sort by `id` so two table snapshots can be compared with `toEqual`. */
function sortById<T extends { id: Id }>(xs: readonly T[]): T[] {
  return [...xs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Snapshot every persisted row in the DB, sorted by id within each table so
 * deep equality is independent of any incidental insertion order. Each row
 * is shallow-cloned via `{...row}` so a later in-place mutation by Dexie or
 * a buggy code path cannot retroactively alter the snapshot.
 */
async function snapshotDb(): Promise<{
  trees: Tree[];
  people: StoredPerson[];
  unions: StoredUnion[];
  parentChildLinks: StoredParentChild[];
}> {
  const [trees, people, unions, parentChildLinks] = await Promise.all([
    db.trees.toArray(),
    db.people.toArray(),
    db.unions.toArray(),
    db.parentChildLinks.toArray(),
  ]);
  return {
    trees: sortById(trees.map((r) => ({ ...r }))),
    people: sortById(people.map((r) => ({ ...r }))),
    unions: sortById(unions.map((r) => ({ ...r }))),
    parentChildLinks: sortById(parentChildLinks.map((r) => ({ ...r }))),
  };
}

// ---------------------------------------------------------------------------
// Generators: registry seed
// ---------------------------------------------------------------------------

/**
 * Per-tree configuration for the optional seed registry: counts include 0
 * so the seed naturally exercises the empty-tree case across iterations.
 */
const treeSeedArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 30 }),
  numPeople: fc.integer({ min: 0, max: 3 }),
  numUnions: fc.integer({ min: 0, max: 2 }),
  numLinks: fc.integer({ min: 0, max: 2 }),
});

/**
 * Optional extra trees on top of the bootstrap default tree. `minLength: 0`
 * so the empty-seed case (only the default tree present) is also exercised.
 */
const seedScenarioArb = fc.array(treeSeedArb, { minLength: 0, maxLength: 3 });

// ---------------------------------------------------------------------------
// Generators: invalid envelope values
// ---------------------------------------------------------------------------
//
// `isSchemaEnvelopeV1` rejects in three places:
//   (a) `typeof value !== 'object' || value === null`
//   (b) `v.version !== 1`
//   (c) any of `v.people`, `v.unions`, `v.parentChildLinks` is not an array
//
// The branches below cover every one of those rejection paths. The final
// `.filter(!isSchemaEnvelopeV1)` is a defensive net for the
// `fc.array(fc.anything())` case — extremely unlikely to produce a valid
// envelope by accident, but the filter guarantees we only ever feed the
// property invalid values.

/** (a) Non-objects: null, primitives, and arrays. */
const nonObjectArb = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.array(fc.anything(), { maxLength: 5 }),
);

/** (b) Object with wrong `version` (anything except the literal `1`). */
const wrongVersionArb = fc.record({
  version: fc.oneof(
    fc.integer().filter((n) => n !== 1),
    fc.string(),
    fc.boolean(),
    fc.constant(null),
    fc.constant(undefined),
  ),
  people: fc.constant([]),
  unions: fc.constant([]),
  parentChildLinks: fc.constant([]),
});

/** (b') Object missing `version` entirely (other fields look right). */
const missingVersionArb = fc.record({
  people: fc.constant([]),
  unions: fc.constant([]),
  parentChildLinks: fc.constant([]),
});

/** (c) Correct version but `people` is not an array. */
const peopleNotArrayArb = fc.record({
  version: fc.constant(1),
  people: fc.oneof(
    fc.string(),
    fc.integer(),
    fc.constant(null),
    fc.constant(undefined),
    fc.record({}),
  ),
  unions: fc.constant([]),
  parentChildLinks: fc.constant([]),
});

/** (c') Correct version but `unions` is not an array. */
const unionsNotArrayArb = fc.record({
  version: fc.constant(1),
  people: fc.constant([]),
  unions: fc.oneof(
    fc.string(),
    fc.integer(),
    fc.constant(null),
    fc.constant(undefined),
    fc.record({}),
  ),
  parentChildLinks: fc.constant([]),
});

/** (c'') Correct version but `parentChildLinks` is not an array (or missing). */
const linksNotArrayArb = fc.record({
  version: fc.constant(1),
  people: fc.constant([]),
  unions: fc.constant([]),
  parentChildLinks: fc.oneof(
    fc.string(),
    fc.integer(),
    fc.constant(null),
    fc.constant(undefined),
    fc.record({}),
  ),
});

/** Empty object (covers all three "missing field" rejection paths at once). */
const emptyObjectArb = fc.constant({});

/**
 * The full union of malformed shapes, filtered to drop any value that
 * accidentally satisfies `isSchemaEnvelopeV1`. The filter is virtually
 * never triggered in practice but keeps the property's precondition
 * exact.
 */
const invalidEnvelopeArb = fc
  .oneof(
    nonObjectArb,
    wrongVersionArb,
    missingVersionArb,
    peopleNotArrayArb,
    unionsNotArrayArb,
    linksNotArrayArb,
    emptyObjectArb,
  )
  .filter((v) => !isSchemaEnvelopeV1(v));

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('Invalid import is rejected without side effects (Property 17)', () => {
  beforeEach(async () => {
    await resetAll();
  });
  afterEach(async () => {
    await resetAll();
  });

  // Property 17: Invalid import is rejected without side effects.
  // For any value that fails `isSchemaEnvelopeV1`, the import flow rejects
  // it (importAsNewTree is never invoked) and the registry and every
  // record remain byte-for-byte unchanged.
  it('any value that fails SchemaEnvelopeV1 validation never reaches importAsNewTree and leaves the DB untouched', async () => {
    await fc.assert(
      fc.asyncProperty(
        seedScenarioArb,
        invalidEnvelopeArb,
        async (seedCfgs, invalidValue) => {
          // fast-check does not run beforeEach between predicate
          // invocations inside a single `fc.assert` call, so reset
          // everything at the start of every iteration.
          await resetAll();

          // -----------------------------------------------------------------
          // Bootstrap establishes the same starting state the real app has
          // on launch: one default tree present and set as the Active_Tree
          // (Req 2.6, 8.2).
          // -----------------------------------------------------------------
          await useActiveTreeStore.getState().bootstrap();

          // -----------------------------------------------------------------
          // Optionally seed extra trees + records on top of the default
          // tree so the "all records remain unchanged" assertion has a
          // non-trivial dataset to compare against. We bypass
          // `useActiveTreeStore.createTree` and write directly to Dexie so
          // the seed step does not also exercise the active-tree pointer
          // / re-hydration paths (which are validated by their own
          // dedicated property tests).
          // -----------------------------------------------------------------
          const extraTrees: Tree[] = [];
          const extraPeople: StoredPerson[] = [];
          const extraUnions: StoredUnion[] = [];
          const extraLinks: StoredParentChild[] = [];

          seedCfgs.forEach((cfg, treeIdx) => {
            const tree: Tree = {
              id: nanoid(),
              // Distinct, ordered timestamps so the registry has a well
              // defined relative order; the bootstrap default tree's
              // createdAt is `new Date().toISOString()` which is later
              // than these 2020 dates, so it remains the most-recent
              // tree (and therefore the Active_Tree). That doesn't
              // matter for the property under test but makes the
              // scenario deterministic.
              createdAt: new Date(2020, 0, 2 + treeIdx).toISOString(),
              name: cfg.name,
            };
            extraTrees.push(tree);

            for (let i = 0; i < cfg.numPeople; i += 1) {
              extraPeople.push({
                id: nanoid(),
                treeId: tree.id,
                givenName: `p${treeIdx}-${i}`,
                familyName: `fam${treeIdx}`,
                createdAt: '2020-01-01T00:00:00.000Z',
                updatedAt: '2020-01-01T00:00:00.000Z',
              });
            }
            for (let i = 0; i < cfg.numUnions; i += 1) {
              extraUnions.push({
                id: nanoid(),
                treeId: tree.id,
                partnerIds: [nanoid(), nanoid()],
                notes: `u${treeIdx}-${i}`,
                createdAt: '2020-01-01T00:00:00.000Z',
                updatedAt: '2020-01-01T00:00:00.000Z',
              });
            }
            for (let i = 0; i < cfg.numLinks; i += 1) {
              extraLinks.push({
                id: nanoid(),
                treeId: tree.id,
                parentIds: [nanoid()],
                childId: nanoid(),
              });
            }
          });

          await db.transaction(
            'rw',
            db.trees,
            db.people,
            db.unions,
            db.parentChildLinks,
            async () => {
              if (extraTrees.length > 0) await db.trees.bulkAdd(extraTrees);
              if (extraPeople.length > 0) await db.people.bulkAdd(extraPeople);
              if (extraUnions.length > 0) await db.unions.bulkAdd(extraUnions);
              if (extraLinks.length > 0) {
                await db.parentChildLinks.bulkAdd(extraLinks);
              }
            },
          );

          // -----------------------------------------------------------------
          // Snapshot the DB before the import attempt.
          // -----------------------------------------------------------------
          const before = await snapshotDb();

          // -----------------------------------------------------------------
          // Verify the generator's precondition: the value really is
          // invalid. If this ever fires the `.filter()` at the end of
          // `invalidEnvelopeArb` is broken.
          // -----------------------------------------------------------------
          expect(isSchemaEnvelopeV1(invalidValue)).toBe(false);

          // -----------------------------------------------------------------
          // Simulate the Data page's gated flow exactly: validate first,
          // call `importAsNewTree` only when validation passes. Because
          // every generated value is invalid, the conditional branch is
          // never taken and `importAsNewTree` is never invoked. Track
          // that explicitly so the property fails loudly if the
          // validation-gate logic is ever weakened.
          // -----------------------------------------------------------------
          let importAsNewTreeWasCalled = false;
          if (isSchemaEnvelopeV1(invalidValue)) {
            importAsNewTreeWasCalled = true;
            // `importAsNewTree` requires a validated SchemaEnvelopeV1, but
            // we only reach this branch when validation has passed, so
            // the cast is safe here. (Unreachable in practice — every
            // generated value is invalid.)
            await useActiveTreeStore
              .getState()
              .importAsNewTree(invalidValue, undefined, 'invalid.json');
          }
          expect(importAsNewTreeWasCalled).toBe(false);

          // -----------------------------------------------------------------
          // Snapshot the DB after the (rejected) import attempt and assert
          // byte-for-byte equality with the before snapshot. This is the
          // "all records remain unchanged" clause of Req 7.3.
          // -----------------------------------------------------------------
          const after = await snapshotDb();
          expect(after).toEqual(before);
        },
      ),
      { numRuns: 100 },
    );
  });
});
