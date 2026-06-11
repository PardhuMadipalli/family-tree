// Feature: multiple-family-trees, Property 3: Referential integrity and single active tree
//
// Validates: Requirements 1.2, 2.1
//
// For any sequence of generated lifecycle and record operations, the
// following invariants must hold after every operation (and at the end of
// the sequence):
//
//   (a) Referential integrity (Req 1.2): every stored record in
//       `db.people`, `db.unions`, and `db.parentChildLinks` carries a
//       `treeId` that references an existing tree in `db.trees`.
//
//   (b) Single active tree (Req 2.1): whenever `db.trees` is non-empty,
//       `useActiveTreeStore.getState().activeTreeId` is non-null AND
//       references a tree currently present in `db.trees`.
//
// Strategy:
//   - Per iteration: clear all four Dexie tables, clear `localStorage`,
//     and reset the three Zustand stores to their initial in-memory shape.
//     Then call `bootstrap()` exactly once to put the store in a
//     well-defined starting state (one default tree set as active).
//   - Generate a sequence of 5..15 operations chosen from the lifecycle
//     and record-write APIs. Operations that reference an existing tree id
//     do so via a `treeIndex: number` that is resolved at execution time
//     against the *current* registry (`trees[treeIndex % trees.length]`),
//     so the ids always reference an existing row even as the registry
//     shrinks/grows during the sequence.
//   - After EACH operation, verify both invariants. After the sequence
//     completes, verify them once more as a final safety check.
//
// `numRuns: 30` because each iteration runs many DB transactions through
// `fake-indexeddb`; the input space is exhaustively explored across the
// op-kind dimensions even at this run count.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { db } from './db';
import { useActiveTreeStore } from './activeTreeStore';
import { usePeopleStore } from './store';
import { useRelationsStore } from './relationsStore';
import { MAX_TREE_NAME_LENGTH } from './domain';

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

/**
 * Assert both invariants for the current state of the world. Reads the DB
 * and the active-tree store directly so the assertions exercise the same
 * persistence layer the production code uses.
 *
 * `label` is included in failure messages so it is obvious which operation
 * in the sequence broke an invariant when fast-check shrinks a counter
 * example.
 */
async function assertInvariants(label: string): Promise<void> {
  const trees = await db.trees.toArray();
  const treeIds = new Set(trees.map((t) => t.id));

  // (a) Referential integrity: every stored record's treeId references an
  //     existing tree (Req 1.2).
  const [people, unions, links] = await Promise.all([
    db.people.toArray(),
    db.unions.toArray(),
    db.parentChildLinks.toArray(),
  ]);

  for (const p of people) {
    expect(
      treeIds.has(p.treeId),
      `[${label}] person ${p.id} has dangling treeId ${p.treeId}`,
    ).toBe(true);
  }
  for (const u of unions) {
    expect(
      treeIds.has(u.treeId),
      `[${label}] union ${u.id} has dangling treeId ${u.treeId}`,
    ).toBe(true);
  }
  for (const l of links) {
    expect(
      treeIds.has(l.treeId),
      `[${label}] parentChildLink ${l.id} has dangling treeId ${l.treeId}`,
    ).toBe(true);
  }

  // (b) Single active tree: when the registry is non-empty, exactly one
  //     activeTreeId is set and references an existing tree (Req 2.1).
  const activeTreeId = useActiveTreeStore.getState().activeTreeId;
  if (trees.length > 0) {
    expect(
      activeTreeId,
      `[${label}] activeTreeId is null but registry has ${trees.length} tree(s)`,
    ).not.toBeNull();
    expect(
      treeIds.has(activeTreeId as string),
      `[${label}] activeTreeId ${activeTreeId} does not reference any tree in registry`,
    ).toBe(true);
  }
}

// ---------------------------------------------------------------------------
// Operation model
// ---------------------------------------------------------------------------
//
// Each operation generates only the data it needs. Tree-id-resolving ops
// carry a `treeIndex: number` that is resolved at execution time via
// `trees[treeIndex % trees.length]`, so the operation always targets an
// existing tree even as the registry mutates during the sequence.

type Operation =
  | { kind: 'createTree'; name: string }
  | { kind: 'deleteTree'; treeIndex: number }
  | { kind: 'setActiveTree'; treeIndex: number }
  | { kind: 'renameTree'; treeIndex: number; name: string }
  | { kind: 'addPerson'; givenName: string; familyName?: string; notes?: string }
  | { kind: 'addUnion'; partnerIds: string[]; notes?: string }
  | { kind: 'addParentChildLink'; parentIds: string[]; childId: string };

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Trimmed valid tree name (length 1..MAX_TREE_NAME_LENGTH after trimming).
 * Validation rejection is exercised by Property 6's dedicated test, so
 * here we keep names valid to ensure the create/rename ops actually
 * mutate the registry.
 */
const validNameArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: MAX_TREE_NAME_LENGTH })
  .map((s) => s.trim())
  .filter((s) => s.length >= 1 && s.length <= MAX_TREE_NAME_LENGTH);

/**
 * Index used by ops that target an existing tree. The actual tree id is
 * resolved at execution time via `treeIndex % trees.length`, so any
 * non-negative integer is meaningful — the modulo keeps it in range no
 * matter how the registry has shifted by the time the op runs.
 */
const treeIndexArb = fc.nat({ max: 1_000 });

const createTreeArb: fc.Arbitrary<Operation> = validNameArb.map((name) => ({
  kind: 'createTree',
  name,
}));

const deleteTreeArb: fc.Arbitrary<Operation> = treeIndexArb.map(
  (treeIndex) => ({ kind: 'deleteTree', treeIndex }),
);

const setActiveTreeArb: fc.Arbitrary<Operation> = treeIndexArb.map(
  (treeIndex) => ({ kind: 'setActiveTree', treeIndex }),
);

const renameTreeArb: fc.Arbitrary<Operation> = fc
  .record({ treeIndex: treeIndexArb, name: validNameArb })
  .map(({ treeIndex, name }) => ({ kind: 'renameTree', treeIndex, name }));

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

/**
 * Arbitrary partner ids: 1..3 random nanoid-shaped strings. They do NOT
 * need to reference existing people for this property — referential
 * integrity is a tree-level invariant; person-id integrity is out of
 * scope for Req 1.2.
 */
const addUnionArb: fc.Arbitrary<Operation> = fc
  .record({
    partnerIds: fc.array(
      fc.stringMatching(/^[A-Za-z0-9_-]{1,30}$/),
      { minLength: 1, maxLength: 3 },
    ),
    notes: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
  })
  .map((r) => ({
    kind: 'addUnion',
    partnerIds: r.partnerIds,
    notes: r.notes,
  }));

const addParentChildLinkArb: fc.Arbitrary<Operation> = fc
  .record({
    parentIds: fc.array(
      fc.stringMatching(/^[A-Za-z0-9_-]{1,30}$/),
      { minLength: 1, maxLength: 2 },
    ),
    childId: fc.stringMatching(/^[A-Za-z0-9_-]{1,30}$/),
  })
  .map((r) => ({
    kind: 'addParentChildLink',
    parentIds: r.parentIds,
    childId: r.childId,
  }));

const operationArb: fc.Arbitrary<Operation> = fc.oneof(
  createTreeArb,
  deleteTreeArb,
  setActiveTreeArb,
  renameTreeArb,
  addPersonArb,
  addUnionArb,
  addParentChildLinkArb,
);

const sequenceArb = fc.array(operationArb, { minLength: 5, maxLength: 15 });

// ---------------------------------------------------------------------------
// Operation execution
// ---------------------------------------------------------------------------

/**
 * Execute a single operation against the production stores. Tree-id-resolving
 * ops read the *current* `trees` from the active-tree store so the
 * targeted id always references an existing row. The store always keeps
 * at least one tree (bootstrap creates the default tree on empty
 * registries; `deleteTree` re-creates it when deleting the last tree), so
 * `trees.length >= 1` should hold whenever a tree-targeting op runs.
 *
 * Record-write ops (`addPerson` / `addUnion` / `addParentChildLink`)
 * implicitly target the Active_Tree via the scoped record stores.
 */
async function executeOperation(op: Operation): Promise<void> {
  const activeTreeStore = useActiveTreeStore.getState();
  const trees = activeTreeStore.trees;

  switch (op.kind) {
    case 'createTree': {
      await activeTreeStore.createTree(op.name);
      return;
    }
    case 'deleteTree': {
      if (trees.length === 0) return; // defensive; shouldn't happen
      const target = trees[op.treeIndex % trees.length];
      await activeTreeStore.deleteTree(target.id);
      return;
    }
    case 'setActiveTree': {
      if (trees.length === 0) return; // defensive; shouldn't happen
      const target = trees[op.treeIndex % trees.length];
      await activeTreeStore.setActiveTree(target.id);
      return;
    }
    case 'renameTree': {
      if (trees.length === 0) return; // defensive; shouldn't happen
      const target = trees[op.treeIndex % trees.length];
      await activeTreeStore.renameActiveOrTree(target.id, op.name);
      return;
    }
    case 'addPerson': {
      // Skip when there is no active tree — `addPerson` would throw
      // (Req 1.4) and that is by design, not an invariant violation.
      if (useActiveTreeStore.getState().activeTreeId === null) return;
      await usePeopleStore.getState().addPerson({
        givenName: op.givenName,
        familyName: op.familyName,
        notes: op.notes,
      });
      return;
    }
    case 'addUnion': {
      if (useActiveTreeStore.getState().activeTreeId === null) return;
      await useRelationsStore
        .getState()
        .addUnion(op.partnerIds, { notes: op.notes });
      return;
    }
    case 'addParentChildLink': {
      if (useActiveTreeStore.getState().activeTreeId === null) return;
      await useRelationsStore
        .getState()
        .addParentChildLink(op.parentIds, op.childId);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('Active-tree store referential integrity and single active tree (Property 3)', () => {
  beforeEach(async () => {
    await resetAll();
  });
  afterEach(async () => {
    await resetAll();
  });

  // Property 3: Referential integrity and single active tree
  // For any sequence of generated lifecycle and record operations:
  //   - every stored record's treeId references an existing tree, and
  //   - whenever the registry is non-empty exactly one activeTreeId is
  //     set and references an existing tree.
  it('every record references an existing tree and exactly one valid active tree is maintained', async () => {
    await fc.assert(
      fc.asyncProperty(sequenceArb, async (operations) => {
        // fast-check does not run beforeEach between predicate invocations
        // inside a single fc.assert call, so reset everything at the start
        // of every iteration.
        await resetAll();

        // Bootstrap establishes the well-defined starting state: one
        // default tree present in the registry and set as the
        // Active_Tree (Req 2.6, 8.2).
        await useActiveTreeStore.getState().bootstrap();
        await assertInvariants('after bootstrap');

        // Execute each operation in turn and re-assert invariants.
        for (let i = 0; i < operations.length; i += 1) {
          const op = operations[i];
          await executeOperation(op);
          await assertInvariants(
            `after op ${i} (${op.kind})`,
          );
        }

        // Final safety net: invariants still hold at sequence end.
        await assertInvariants('after sequence');
      }),
      { numRuns: 30 },
    );
  });
});
