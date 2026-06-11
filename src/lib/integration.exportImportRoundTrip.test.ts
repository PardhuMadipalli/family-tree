// Feature: multiple-family-trees, Property 20: Export then import round-trip
//
// Validates: Requirements 9.3
//
// For any tree, exporting it to a `SchemaEnvelopeV1` and then importing
// that envelope as a new tree produces a tree whose people, unions, and
// parent-child links correspond one-to-one with the original tree's
// records by identifier and by every portable field value, with no
// records added or missing. The original tree is left unchanged.
//
// This is an end-to-end integration test: it drives the same code paths
// the production app uses on the Data page (export the active tree ->
// validate envelope -> import as a new tree).
//
// Strategy:
//   - Per iteration: clear all four Dexie tables, clear `localStorage`,
//     and reset the three Zustand stores back to their initial in-memory
//     shape. (fast-check does not run beforeEach between predicate calls
//     inside a single `fc.assert`, so the reset has to happen at the
//     start of every iteration.) Driving the singleton `db` and stores
//     keeps each iteration cheap; spinning up a fresh Dexie instance per
//     iteration would re-run the v2 upgrade.
//   - Call `useActiveTreeStore.bootstrap()` to mirror app startup. With
//     an empty registry this creates the default tree and activates it.
//   - Call `useActiveTreeStore.createTree('A')`. This adds tree A to the
//     registry and activates it (the active tree is now A).
//   - Add a randomized non-empty set of people via
//     `usePeopleStore.addPerson`, unions via `useRelationsStore.addUnion`,
//     and parent-child links via `useRelationsStore.addParentChildLink`
//     so tree A has >= 1 of each. The stores write to Dexie via the same
//     code paths the production app uses; the active-tree id is stamped
//     onto each record automatically.
//   - Snapshot tree A's records straight from Dexie via
//     `getPeopleByTree(treeAId)` etc. so the snapshot is independent of
//     the in-memory store (which is scoped to the active tree and is
//     about to be re-hydrated for tree B).
//   - Call `exportActiveTree(treeAId)` to produce a portable envelope.
//   - Call `useActiveTreeStore.importAsNewTree(envelope, 'B', 'tree-A.json')`
//     and capture tree B's id from the result. Import-as-new-tree is
//     atomic and activates the new tree (Req 7.4–7.6).
//   - Read tree B's records via `getPeopleByTree(treeBId)` etc.
//   - Assert tree B's record id sets equal tree A's, and each tree B
//     record's portable fields (every field except `treeId`) equal tree
//     A's record byte-for-byte.
//   - Assert each tree B record's `treeId` is the new tree's id.
//   - Re-read tree A's records and assert they are byte-for-byte
//     unchanged after the import.
//
// `numRuns: 30` — round-trip iterations are heavy (bootstrap + create +
// many writes through optimistic-update stores + export + atomic import
// transaction + many reads) and 30 runs is sufficient to explore the
// portable-record-shape input space while keeping the suite fast.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  db,
  getParentChildLinksByTree,
  getPeopleByTree,
  getUnionsByTree,
} from './db';
import { exportActiveTree } from './io';
import { useActiveTreeStore } from './activeTreeStore';
import { usePeopleStore } from './store';
import { useRelationsStore } from './relationsStore';
import type {
  Id,
  StoredParentChild,
  StoredPerson,
  StoredUnion,
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
 * their initial in-memory shapes. Action functions stay intact (Zustand
 * `setState` is a partial merge), so subsequent calls into `bootstrap()`,
 * `createTree(...)`, etc. still hit the production code paths.
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

/** Stable sort by `id` so two record sets compare with `toEqual`. */
function sortById<T extends { id: Id }>(xs: readonly T[]): T[] {
  return [...xs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Strip the `treeId` field from a stored record to recover the portable
 * shape. Tree A's records and tree B's records differ only in their
 * `treeId` association (each carries its own); after stripping, every
 * other field must be identical for the round-trip to be lossless.
 */
function stripTreeId<T extends { treeId: Id }>(r: T): Omit<T, 'treeId'> {
  const { treeId: _t, ...rest } = r;
  return rest;
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
//
// We generate record *inputs* (not full records) and feed them through the
// production stores so the test exercises the real `addPerson` / `addUnion`
// / `addParentChildLink` code paths. Ids and timestamps are produced inside
// those stores.
//
// `partnerIndices` / `parentIndices` / `childIndex` are indices into the
// generated `people` array, resolved at execution time via `idx % len` so
// they always reference an actual person id that exists in tree A. This
// keeps every generated scenario semantically valid (parents and children
// of links are real people in the tree, partners of unions are real
// people in the tree).

const personInputArb = fc.record({
  givenName: fc.string({ minLength: 1, maxLength: 30 }),
  familyName: fc.option(fc.string({ minLength: 1, maxLength: 30 }), {
    nil: undefined,
  }),
  gender: fc.option(
    fc.constantFrom<'male' | 'female' | 'other' | 'unknown'>(
      'male',
      'female',
      'other',
      'unknown',
    ),
    { nil: undefined },
  ),
  birthDate: fc.option(
    fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim().length > 0),
    { nil: undefined },
  ),
  notes: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
});

const unionInputArb = fc.record({
  // Indices into the people array, resolved at execution time.
  partnerIndices: fc.array(fc.nat({ max: 100 }), {
    minLength: 1,
    maxLength: 3,
  }),
  notes: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
  startDate: fc.option(
    fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim().length > 0),
    { nil: undefined },
  ),
});

const linkInputArb = fc.record({
  parentIndices: fc.array(fc.nat({ max: 100 }), {
    minLength: 1,
    maxLength: 2,
  }),
  childIndex: fc.nat({ max: 100 }),
});

/**
 * Whole scenario: at least one of every record kind so the property's
 * preconditions (>= 1 person, >= 1 union, >= 1 parent-child link) are
 * always satisfied; counts are bounded so each iteration runs fast.
 */
const scenarioArb = fc.record({
  people: fc.array(personInputArb, { minLength: 1, maxLength: 5 }),
  unions: fc.array(unionInputArb, { minLength: 1, maxLength: 3 }),
  links: fc.array(linkInputArb, { minLength: 1, maxLength: 3 }),
});

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('export -> import-as-new-tree round-trip (Property 20)', () => {
  beforeEach(async () => {
    await resetAll();
  });
  afterEach(async () => {
    await resetAll();
  });

  // Property 20: Export then import round-trip
  // Validates: Requirements 9.3
  it('importing the export of tree A as tree B yields records matching A by id and portable fields, leaving A unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (scenario) => {
        // fast-check does not run beforeEach between predicate calls
        // inside a single fc.assert, so reset everything per iteration.
        await resetAll();

        // -----------------------------------------------------------------
        // Bootstrap mirrors app startup: with an empty registry this
        // creates the default tree and activates it (Req 2.6, 8.2).
        // -----------------------------------------------------------------
        await useActiveTreeStore.getState().bootstrap();
        expect(useActiveTreeStore.getState().isReady).toBe(true);

        // -----------------------------------------------------------------
        // Create tree A. The store activates the new tree on success
        // (Req 4.2), so subsequent record writes belong to A.
        // -----------------------------------------------------------------
        const createA = await useActiveTreeStore.getState().createTree('A');
        expect(createA.ok).toBe(true);
        if (!createA.ok) return; // narrows the discriminated union
        const treeAId = createA.tree.id;
        expect(useActiveTreeStore.getState().activeTreeId).toBe(treeAId);

        // -----------------------------------------------------------------
        // Add the records the property requires (>= 1 person, >= 1 union,
        // >= 1 parent-child link). Writes go through the production
        // stores, which stamp `treeId` from the active-tree store
        // (Req 1.4) and run optimistic-then-Dexie updates.
        // -----------------------------------------------------------------
        const personIds: Id[] = [];
        for (const input of scenario.people) {
          const id = await usePeopleStore.getState().addPerson(input);
          personIds.push(id);
        }
        // Sanity: addPerson succeeded for every input we generated.
        expect(personIds.length).toBe(scenario.people.length);

        for (const u of scenario.unions) {
          const partnerIds = u.partnerIndices.map(
            (idx) => personIds[idx % personIds.length],
          );
          await useRelationsStore
            .getState()
            .addUnion(partnerIds, { startDate: u.startDate, notes: u.notes });
        }

        for (const l of scenario.links) {
          const parentIds = l.parentIndices.map(
            (idx) => personIds[idx % personIds.length],
          );
          const childId = personIds[l.childIndex % personIds.length];
          await useRelationsStore
            .getState()
            .addParentChildLink(parentIds, childId);
        }

        // -----------------------------------------------------------------
        // Snapshot tree A's records straight from Dexie (independent of
        // the in-memory store, which is about to be re-hydrated for B).
        // Sorted by id so the equality assertions later are independent
        // of any incidental insertion order.
        // -----------------------------------------------------------------
        const aPeopleBefore = sortById(
          (await getPeopleByTree(treeAId)).map((r) => ({ ...r })),
        );
        const aUnionsBefore = sortById(
          (await getUnionsByTree(treeAId)).map((r) => ({ ...r })),
        );
        const aLinksBefore = sortById(
          (await getParentChildLinksByTree(treeAId)).map((r) => ({ ...r })),
        );

        // Sanity: the property's preconditions held — tree A has >= 1
        // record of each kind.
        expect(aPeopleBefore.length).toBeGreaterThanOrEqual(1);
        expect(aUnionsBefore.length).toBeGreaterThanOrEqual(1);
        expect(aLinksBefore.length).toBeGreaterThanOrEqual(1);

        // -----------------------------------------------------------------
        // Export tree A -> portable envelope.
        // -----------------------------------------------------------------
        const envelope = await exportActiveTree(treeAId);
        expect(envelope.version).toBe(1);

        // -----------------------------------------------------------------
        // Import the envelope as tree B. The active-tree store runs the
        // import in a single Dexie rw transaction (atomic) and activates
        // the new tree on success (Req 7.4–7.6).
        // -----------------------------------------------------------------
        const importResult = await useActiveTreeStore
          .getState()
          .importAsNewTree(envelope, 'B', 'tree-A.json');
        // Surface the rejection reason in the failure message so the
        // counter-example points at the actual cause, not just `ok=false`.
        expect(
          importResult.ok,
          `importAsNewTree rejected: ${
            importResult.ok ? '' : importResult.reason
          }`,
        ).toBe(true);
        if (!importResult.ok) return; // narrows the discriminated union
        const treeBId = importResult.tree.id;
        expect(treeBId).not.toBe(treeAId);
        expect(importResult.tree.name).toBe('B');
        // Imported tree is now the Active_Tree (Req 7.6).
        expect(useActiveTreeStore.getState().activeTreeId).toBe(treeBId);

        // -----------------------------------------------------------------
        // Read tree B's records straight from Dexie and assert exactness
        // against tree A's snapshot.
        // -----------------------------------------------------------------
        const bPeople: StoredPerson[] = sortById(
          await getPeopleByTree(treeBId),
        );
        const bUnions: StoredUnion[] = sortById(
          await getUnionsByTree(treeBId),
        );
        const bLinks: StoredParentChild[] = sortById(
          await getParentChildLinksByTree(treeBId),
        );

        // (1) Identifier sets match exactly: same ids, no records added
        //     and none missing.
        expect(bPeople.map((r) => r.id)).toEqual(
          aPeopleBefore.map((r) => r.id),
        );
        expect(bUnions.map((r) => r.id)).toEqual(
          aUnionsBefore.map((r) => r.id),
        );
        expect(bLinks.map((r) => r.id)).toEqual(aLinksBefore.map((r) => r.id));

        // (2) Counts match (a redundant but cheap check that catches a
        //     dropped or duplicated record before the deep equality
        //     check below).
        expect(bPeople.length).toBe(aPeopleBefore.length);
        expect(bUnions.length).toBe(aUnionsBefore.length);
        expect(bLinks.length).toBe(aLinksBefore.length);

        // (3) Portable fields are byte-for-byte identical: tree A's and
        //     tree B's records differ only in their `treeId`
        //     association. Stripping `treeId` from both sides leaves the
        //     portable PersonV1 / UnionV1 / ParentChildV1 shapes, which
        //     must be deeply equal.
        expect(bPeople.map(stripTreeId)).toEqual(
          aPeopleBefore.map(stripTreeId),
        );
        expect(bUnions.map(stripTreeId)).toEqual(
          aUnionsBefore.map(stripTreeId),
        );
        expect(bLinks.map(stripTreeId)).toEqual(aLinksBefore.map(stripTreeId));

        // (4) Every tree B record carries tree B's id (and only tree
        //     B's id) — no leakage of A's id into B's records, no
        //     stray treeId values.
        for (const r of bPeople) expect(r.treeId).toBe(treeBId);
        for (const r of bUnions) expect(r.treeId).toBe(treeBId);
        for (const r of bLinks) expect(r.treeId).toBe(treeBId);

        // -----------------------------------------------------------------
        // Tree A's records are unchanged after the import. This is the
        // "leaves the tree-records and tree-registry entries of all
        // previously existing trees unchanged" clause (Req 7.5) which
        // Property 20 also implicitly relies on for the round-trip
        // semantics in Req 9.3.
        // -----------------------------------------------------------------
        const aPeopleAfter = sortById(await getPeopleByTree(treeAId));
        const aUnionsAfter = sortById(await getUnionsByTree(treeAId));
        const aLinksAfter = sortById(await getParentChildLinksByTree(treeAId));
        expect(aPeopleAfter).toEqual(aPeopleBefore);
        expect(aUnionsAfter).toEqual(aUnionsBefore);
        expect(aLinksAfter).toEqual(aLinksBefore);
      }),
      { numRuns: 30 },
    );
  });
});
