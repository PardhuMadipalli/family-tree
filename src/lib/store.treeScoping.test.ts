// Feature: multiple-family-trees, Property 2: Record mutation is tree-scoped
//
// Validates: Requirements 1.4
//
// For any registry containing >= 2 trees each with their own records, after
// activating one tree, executing any sequence of record-mutation operations
// (addPerson / addUnion / addParentChildLink / updatePerson / deletePerson)
// against the active tree leaves every other tree's records (people,
// unions, parent-child links) byte-for-byte unchanged.
//
// Strategy:
//   - Per iteration: clear all four Dexie tables, clear localStorage, and
//     reset the three Zustand stores to their initial in-memory shape.
//   - Generate >= 2 trees, each with 0..3 of each record kind. Bulk-insert
//     the whole registry into Dexie in a single rw transaction.
//   - Pick one tree as the Active_Tree, install the registry+activeTreeId
//     directly into `useActiveTreeStore` (so `bootstrap()` won't run and
//     accidentally introduce extra default trees), then drive
//     `usePeopleStore.hydrate()` / `useRelationsStore.hydrate()` so the
//     scoped stores load only the active tree's records.
//   - Snapshot every OTHER tree's records (byte-for-byte) BEFORE the
//     sequence of operations runs.
//   - Generate 3..10 record-mutation operations and execute them through
//     the production stores. `updatePerson` / `deletePerson` resolve their
//     target id at execution time from the *current* `usePeopleStore`
//     state, so they always operate on a person that belongs to the
//     active tree (the scoped hydrate guarantees only active-tree people
//     live in the store).
//   - After every operation AND once more at the end, compare each other
//     tree's records (people / unions / parent-child links, read directly
//     from Dexie) with the captured snapshot and require strict equality.
//
// numRuns: 50 — operation sequences are expensive (each op runs at least
// one Dexie transaction under fake-indexeddb plus a re-read of every other
// tree's records for verification), and the input-space coverage at this
// run count is sufficient to catch mutation-leakage regressions.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { nanoid } from 'nanoid';

import {
  db,
  getParentChildLinksByTree,
  getPeopleByTree,
  getUnionsByTree,
} from './db';
import { useActiveTreeStore } from './activeTreeStore';
import { usePeopleStore } from './store';
import { useRelationsStore } from './relationsStore';
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
 * Reset the active-tree store and the two scoped record stores back to
 * their initial shapes. Action functions stay intact (Zustand `setState`
 * is a partial merge), so subsequent calls into the production code paths
 * work exactly as in app code.
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
function sortById<T extends { id: string }>(xs: readonly T[]): T[] {
  return [...xs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

type Bundle = {
  people: StoredPerson[];
  unions: StoredUnion[];
  parentChildLinks: StoredParentChild[];
};

// ---------------------------------------------------------------------------
// Operation model
// ---------------------------------------------------------------------------
//
// `addPerson` / `addUnion` / `addParentChildLink` are inherently
// active-tree-scoped: the production stores stamp `treeId` from
// `useActiveTreeStore.getState().activeTreeId` (Req 1.4). They carry only
// the data they need.
//
// `updatePerson` / `deletePerson` operate on a `personIndex: number` that
// is resolved at execution time against the *current* `usePeopleStore`
// state via `people[personIndex % people.length]`. Because the people
// store is scoped to the Active_Tree, this guarantees the targeted id
// belongs to the active tree (the test's intent: mutate active-tree
// records, observe that other trees stay byte-identical).

type Operation =
  | { kind: 'addPerson'; givenName: string; familyName?: string; notes?: string }
  | { kind: 'addUnion'; partnerIds: string[]; notes?: string }
  | { kind: 'addParentChildLink'; parentIds: string[]; childId: string }
  | {
      kind: 'updatePerson';
      personIndex: number;
      givenName: string;
      notes?: string;
    }
  | { kind: 'deletePerson'; personIndex: number };

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const idArb = fc.stringMatching(/^[A-Za-z0-9_-]{12,21}$/);

/**
 * Per-tree configuration: how many of each record kind the tree owns.
 * Counts stay bounded so each iteration runs fast under fake-indexeddb,
 * while still exercising the "tree with zero records" boundary case.
 */
const treeConfigArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 30 }),
  numPeople: fc.integer({ min: 0, max: 3 }),
  numUnions: fc.integer({ min: 0, max: 3 }),
  numLinks: fc.integer({ min: 0, max: 3 }),
});

const addPersonArb: fc.Arbitrary<Operation> = fc
  .record({
    givenName: fc.string({ minLength: 1, maxLength: 30 }),
    familyName: fc.option(fc.string({ minLength: 1, maxLength: 30 }), {
      nil: undefined,
    }),
    notes: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
  })
  .map((r) => ({
    kind: 'addPerson',
    givenName: r.givenName,
    familyName: r.familyName,
    notes: r.notes,
  }));

const addUnionArb: fc.Arbitrary<Operation> = fc
  .record({
    partnerIds: fc.array(idArb, { minLength: 1, maxLength: 3 }),
    notes: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
  })
  .map((r) => ({
    kind: 'addUnion',
    partnerIds: r.partnerIds,
    notes: r.notes,
  }));

const addParentChildLinkArb: fc.Arbitrary<Operation> = fc
  .record({
    parentIds: fc.array(idArb, { minLength: 1, maxLength: 2 }),
    childId: idArb,
  })
  .map((r) => ({
    kind: 'addParentChildLink',
    parentIds: r.parentIds,
    childId: r.childId,
  }));

const updatePersonArb: fc.Arbitrary<Operation> = fc
  .record({
    personIndex: fc.nat({ max: 1_000 }),
    givenName: fc.string({ minLength: 1, maxLength: 30 }),
    notes: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
  })
  .map((r) => ({
    kind: 'updatePerson',
    personIndex: r.personIndex,
    givenName: r.givenName,
    notes: r.notes,
  }));

const deletePersonArb: fc.Arbitrary<Operation> = fc
  .nat({ max: 1_000 })
  .map((personIndex) => ({ kind: 'deletePerson', personIndex }));

const operationArb: fc.Arbitrary<Operation> = fc.oneof(
  addPersonArb,
  addUnionArb,
  addParentChildLinkArb,
  updatePersonArb,
  deletePersonArb,
);

const sequenceArb = fc.array(operationArb, { minLength: 3, maxLength: 10 });

/**
 * Build a registry of N (>= 2) trees from per-tree configs. Returns the
 * trees plus a per-tree bundle of records keyed by tree id. Record ids
 * use nanoid so they are globally unique without coordination.
 */
function buildRegistry(
  treeCfgs: ReadonlyArray<{
    name: string;
    numPeople: number;
    numUnions: number;
    numLinks: number;
  }>,
): { trees: Tree[]; byTreeId: Map<Id, Bundle> } {
  const trees: Tree[] = [];
  const byTreeId = new Map<Id, Bundle>();

  treeCfgs.forEach((cfg, treeIdx) => {
    const tree: Tree = {
      id: nanoid(),
      name: cfg.name,
      // Distinct timestamps per tree so the registry has a deterministic
      // order independent of insertion order.
      createdAt: new Date(Date.UTC(2024, 0, treeIdx + 1)).toISOString(),
    };
    trees.push(tree);

    const people: StoredPerson[] = Array.from(
      { length: cfg.numPeople },
      (_, i) => ({
        id: nanoid(),
        treeId: tree.id,
        givenName: `seed-p-${treeIdx}-${i}`,
        // Distinct timestamps so any silent mutation surfaces in equality
        // comparisons.
        createdAt: new Date(Date.UTC(2024, 1, treeIdx + 1)).toISOString(),
        updatedAt: new Date(Date.UTC(2024, 1, treeIdx + 1)).toISOString(),
      }),
    );

    const unions: StoredUnion[] = Array.from(
      { length: cfg.numUnions },
      (_, i) => ({
        id: nanoid(),
        treeId: tree.id,
        partnerIds: [nanoid(), nanoid()],
        notes: `seed-u-${treeIdx}-${i}`,
        createdAt: new Date(Date.UTC(2024, 2, treeIdx + 1)).toISOString(),
        updatedAt: new Date(Date.UTC(2024, 2, treeIdx + 1)).toISOString(),
      }),
    );

    const parentChildLinks: StoredParentChild[] = Array.from(
      { length: cfg.numLinks },
      () => ({
        id: nanoid(),
        treeId: tree.id,
        parentIds: [nanoid()],
        childId: nanoid(),
      }),
    );

    byTreeId.set(tree.id, { people, unions, parentChildLinks });
  });

  return { trees, byTreeId };
}

/** Bulk-insert the registry into Dexie in a single rw transaction. */
async function seedRegistry(
  trees: Tree[],
  byTreeId: Map<Id, Bundle>,
): Promise<void> {
  await db.transaction(
    'rw',
    db.trees,
    db.people,
    db.unions,
    db.parentChildLinks,
    async () => {
      await db.trees.bulkAdd(trees);
      for (const bundle of byTreeId.values()) {
        if (bundle.people.length > 0) await db.people.bulkAdd(bundle.people);
        if (bundle.unions.length > 0) await db.unions.bulkAdd(bundle.unions);
        if (bundle.parentChildLinks.length > 0) {
          await db.parentChildLinks.bulkAdd(bundle.parentChildLinks);
        }
      }
    },
  );
}

/**
 * Capture each non-active tree's records straight from Dexie so the
 * snapshot does not depend on the in-memory store (which is scoped to the
 * active tree and therefore wouldn't see the other trees' records).
 */
async function snapshotOtherTrees(
  trees: Tree[],
  activeTreeId: Id,
): Promise<Map<Id, Bundle>> {
  const snap = new Map<Id, Bundle>();
  for (const t of trees) {
    if (t.id === activeTreeId) continue;
    const [people, unions, parentChildLinks] = await Promise.all([
      getPeopleByTree(t.id),
      getUnionsByTree(t.id),
      getParentChildLinksByTree(t.id),
    ]);
    snap.set(t.id, {
      people: sortById(people),
      unions: sortById(unions),
      parentChildLinks: sortById(parentChildLinks),
    });
  }
  return snap;
}

/**
 * Assert each non-active tree's records still match the snapshot
 * byte-for-byte. `label` carries op context into failure messages so a
 * shrunken counter-example points directly at the offending step.
 */
async function assertOtherTreesUnchanged(
  snapshot: Map<Id, Bundle>,
  label: string,
): Promise<void> {
  for (const [treeId, expected] of snapshot.entries()) {
    const [people, unions, parentChildLinks] = await Promise.all([
      getPeopleByTree(treeId),
      getUnionsByTree(treeId),
      getParentChildLinksByTree(treeId),
    ]);
    expect(
      sortById(people),
      `[${label}] tree ${treeId} people changed`,
    ).toEqual(expected.people);
    expect(
      sortById(unions),
      `[${label}] tree ${treeId} unions changed`,
    ).toEqual(expected.unions);
    expect(
      sortById(parentChildLinks),
      `[${label}] tree ${treeId} parentChildLinks changed`,
    ).toEqual(expected.parentChildLinks);
  }
}

// ---------------------------------------------------------------------------
// Operation execution
// ---------------------------------------------------------------------------

/**
 * Run a single operation through the production stores. updatePerson and
 * deletePerson resolve the target person from the *current* people store
 * (which is scoped to the Active_Tree); when the active tree currently
 * has zero people the op is a no-op for that step (still a valid sequence
 * — the property must hold either way).
 */
async function executeOperation(op: Operation): Promise<void> {
  switch (op.kind) {
    case 'addPerson': {
      await usePeopleStore.getState().addPerson({
        givenName: op.givenName,
        familyName: op.familyName,
        notes: op.notes,
      });
      return;
    }
    case 'addUnion': {
      await useRelationsStore
        .getState()
        .addUnion(op.partnerIds, { notes: op.notes });
      return;
    }
    case 'addParentChildLink': {
      await useRelationsStore
        .getState()
        .addParentChildLink(op.parentIds, op.childId);
      return;
    }
    case 'updatePerson': {
      const people = usePeopleStore.getState().people;
      if (people.length === 0) return;
      const target = people[op.personIndex % people.length];
      await usePeopleStore
        .getState()
        .updatePerson(target.id, {
          givenName: op.givenName,
          notes: op.notes,
        });
      return;
    }
    case 'deletePerson': {
      const people = usePeopleStore.getState().people;
      if (people.length === 0) return;
      const target = people[op.personIndex % people.length];
      await usePeopleStore.getState().deletePerson(target.id);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('Record mutation is tree-scoped (Property 2)', () => {
  beforeEach(async () => {
    await resetAll();
  });
  afterEach(async () => {
    await resetAll();
  });

  // Property 2: Record mutation is tree-scoped
  // Generate a registry with >= 2 trees and records; activate one tree;
  // for any sequence of addPerson/addUnion/addParentChildLink/
  // updatePerson/deletePerson ops, the records of every other tree
  // remain byte-for-byte unchanged.
  it('mutating active-tree records leaves every other tree unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(treeConfigArb, { minLength: 2, maxLength: 3 }),
        fc.nat({ max: 1_000 }),
        sequenceArb,
        async (treeCfgs, activeOffset, operations) => {
          // fast-check does not run beforeEach between predicate calls
          // inside a single fc.assert, so reset everything per iteration.
          await resetAll();

          // ---- build & seed the registry ----
          const { trees, byTreeId } = buildRegistry(treeCfgs);
          await seedRegistry(trees, byTreeId);

          // ---- pick the active tree ----
          const activeIdx = activeOffset % trees.length;
          const activeTree = trees[activeIdx];

          // Install registry + active id directly so bootstrap doesn't
          // run (bootstrap would create a default tree on an empty
          // registry, but more importantly we want the test to drive the
          // exact registry it generated). Sorting the trees array by
          // createdAt desc matches getAllTrees()'s ordering.
          const orderedTrees = [...trees].sort((a, b) =>
            a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
          );
          useActiveTreeStore.setState({
            trees: orderedTrees,
            activeTreeId: activeTree.id,
            isReady: true,
            status: 'ok',
            error: null,
          });

          // Hydrate the scoped record stores from Dexie so updatePerson /
          // deletePerson can pick targets from the active tree's people.
          await Promise.all([
            usePeopleStore.getState().hydrate(),
            useRelationsStore.getState().hydrate(),
          ]);

          // ---- snapshot every other tree's records ----
          const snapshot = await snapshotOtherTrees(trees, activeTree.id);
          await assertOtherTreesUnchanged(snapshot, 'before sequence');

          // ---- run the sequence, asserting after every op ----
          for (let i = 0; i < operations.length; i += 1) {
            const op = operations[i];
            await executeOperation(op);
            await assertOtherTreesUnchanged(
              snapshot,
              `after op ${i} (${op.kind})`,
            );
          }

          // Final safety net.
          await assertOtherTreesUnchanged(snapshot, 'after sequence');
        },
      ),
      { numRuns: 50 },
    );
  });
});
