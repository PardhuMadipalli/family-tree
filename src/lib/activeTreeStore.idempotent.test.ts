// Feature: multiple-family-trees, Property 10: Selecting the active tree is idempotent
//
// Validates: Requirements 3.7
//
// For any registry containing at least one tree (each owning some records)
// and any resolved Active_Tree, calling
// `useActiveTreeStore.getState().setActiveTree(activeTreeId)` (i.e.
// re-selecting the tree that is already active) must leave:
//   - `activeTreeId` unchanged, and
//   - the contents of `usePeopleStore` (people array) unchanged, and
//   - the contents of `useRelationsStore` (unions + parentChildLinks
//     arrays) unchanged.
//
// Strategy:
//   - Drive the production `useActiveTreeStore` against the singleton
//     Dexie `db` (backed by `fake-indexeddb` from the shared test setup).
//   - Per iteration: clear all four DB tables, clear `localStorage`, and
//     reset the three Zustand stores to their initial state. Spinning up
//     a fresh Dexie instance per iteration is heavy under fake-indexeddb,
//     so the cheaper "clear and reset" pattern is preferred (matches the
//     sibling property tests in this directory).
//   - Seed the registry with N >= 1 trees, each carrying some people /
//     unions / parent-child links.
//   - Call `bootstrap()` so the active-tree store resolves an
//     `activeTreeId` and re-hydrates both record stores.
//   - Snapshot the resolved id and the contents of the record stores.
//   - Call `setActiveTree(activeTreeId)` (selecting the already-active id).
//   - Assert the resolved id and the record-store contents are unchanged.
//
// Note: tasks 8.1/8.2 will scope `usePeopleStore` / `useRelationsStore` to
// the active tree. This property is about unchanged-ness rather than
// any specific tree-scoped behavior, so it holds either way: whatever
// hydrate produced before the no-op call must still be there afterward.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { nanoid } from 'nanoid';

import { db } from './db';
import { useActiveTreeStore } from './activeTreeStore';
import { usePeopleStore } from './store';
import { useRelationsStore } from './relationsStore';
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

/**
 * Reset the three Zustand stores back to their initial state. Methods are
 * preserved (Zustand `setState` is a partial merge), only the data fields
 * are wiped.
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

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Per-tree configuration: display name plus the number of records of each
 * kind the tree owns. Counts are bounded to keep each iteration cheap
 * under fake-indexeddb while still exercising the M=0 edge case (an empty
 * tree).
 */
const treeConfigArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 30 }),
  numPeople: fc.integer({ min: 0, max: 3 }),
  numUnions: fc.integer({ min: 0, max: 3 }),
  numLinks: fc.integer({ min: 0, max: 3 }),
});

/**
 * The whole scenario: N >= 1 trees. The active tree resolved by
 * `bootstrap()` will be the most-recently-created one (the pointer is
 * cleared at the start of every iteration), so any number of trees in
 * 1..3 is meaningful for the property.
 */
const scenarioArb = fc.array(treeConfigArb, { minLength: 1, maxLength: 3 });

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('setActiveTree idempotency', () => {
  // Reset before and after the suite so a residual row from a previous
  // test file (e.g. another suite that opens the singleton db) cannot
  // influence the result.
  beforeEach(async () => {
    await clearAllTables();
    window.localStorage.clear();
    resetStores();
  });
  afterEach(async () => {
    await clearAllTables();
    window.localStorage.clear();
    resetStores();
  });

  // Property 10: Selecting the active tree is idempotent
  // For any registry and any active id, calling
  // setActiveTree(activeTreeId) leaves activeTreeId and the contents of
  // usePeopleStore and useRelationsStore unchanged.
  it('selecting the already-active tree leaves activeTreeId and record-store contents unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (treeCfgs) => {
        // fast-check does not run beforeEach between predicate invocations
        // inside a single `fc.assert` call, so reset everything at the
        // start of every iteration.
        await clearAllTables();
        window.localStorage.clear();
        resetStores();

        // -----------------------------------------------------------------
        // Build the in-memory expectation: trees + per-tree records, with
        // distinct createdAt timestamps so the "most recent" tree is
        // unambiguous.
        // -----------------------------------------------------------------
        const trees: Tree[] = [];
        const allPeople: StoredPerson[] = [];
        const allUnions: StoredUnion[] = [];
        const allLinks: StoredParentChild[] = [];

        treeCfgs.forEach((cfg, treeIdx) => {
          const tree: Tree = {
            id: nanoid(),
            name: cfg.name,
            // Distinct, ordered timestamps so the registry has a well
            // defined most-recent tree per scenario.
            createdAt: new Date(2020, 0, 1 + treeIdx).toISOString(),
          };
          trees.push(tree);

          for (let i = 0; i < cfg.numPeople; i += 1) {
            allPeople.push({
              id: nanoid(),
              treeId: tree.id,
              givenName: `p${treeIdx}-${i}`,
              createdAt: '2020-01-01T00:00:00.000Z',
              updatedAt: '2020-01-01T00:00:00.000Z',
            });
          }
          for (let i = 0; i < cfg.numUnions; i += 1) {
            allUnions.push({
              id: nanoid(),
              treeId: tree.id,
              partnerIds: [nanoid(), nanoid()],
              createdAt: '2020-01-01T00:00:00.000Z',
              updatedAt: '2020-01-01T00:00:00.000Z',
            });
          }
          for (let i = 0; i < cfg.numLinks; i += 1) {
            allLinks.push({
              id: nanoid(),
              treeId: tree.id,
              parentIds: [nanoid()],
              childId: nanoid(),
            });
          }
        });

        // -----------------------------------------------------------------
        // Persist everything to Dexie in a single rw transaction so setup
        // is atomic and fast.
        // -----------------------------------------------------------------
        await db.transaction(
          'rw',
          db.trees,
          db.people,
          db.unions,
          db.parentChildLinks,
          async () => {
            await db.trees.bulkAdd(trees);
            if (allPeople.length > 0) await db.people.bulkAdd(allPeople);
            if (allUnions.length > 0) await db.unions.bulkAdd(allUnions);
            if (allLinks.length > 0) await db.parentChildLinks.bulkAdd(allLinks);
          },
        );

        // -----------------------------------------------------------------
        // Bootstrap resolves an activeTreeId from the (cleared) pointer
        // and the seeded registry, then re-hydrates both record stores.
        // -----------------------------------------------------------------
        await useActiveTreeStore.getState().bootstrap();

        const activeIdBefore = useActiveTreeStore.getState().activeTreeId;
        // Sanity check: we seeded N >= 1 trees so resolution must succeed.
        expect(activeIdBefore).not.toBeNull();
        expect(useActiveTreeStore.getState().isReady).toBe(true);

        // Snapshot the record-store contents (whatever hydrate produced —
        // un-scoped today, scoped after tasks 8.1/8.2; the property
        // doesn't care which, only that the contents stay the same).
        const peopleBefore = usePeopleStore.getState().people;
        const unionsBefore = useRelationsStore.getState().unions;
        const linksBefore = useRelationsStore.getState().parentChildLinks;

        // -----------------------------------------------------------------
        // Act: re-select the already-active tree (the no-op path).
        // -----------------------------------------------------------------
        await useActiveTreeStore.getState().setActiveTree(activeIdBefore!);

        // -----------------------------------------------------------------
        // Assertions
        // -----------------------------------------------------------------
        // 1) activeTreeId is unchanged.
        const activeIdAfter = useActiveTreeStore.getState().activeTreeId;
        expect(activeIdAfter).toBe(activeIdBefore);

        // 2) usePeopleStore contents are unchanged. Use structural
        //    equality so a re-hydration that produced an equal-but-fresh
        //    array would still satisfy the property's "contents
        //    unchanged" wording.
        const peopleAfter = usePeopleStore.getState().people;
        expect(peopleAfter).toEqual(peopleBefore);

        // 3) useRelationsStore contents are unchanged.
        const unionsAfter = useRelationsStore.getState().unions;
        const linksAfter = useRelationsStore.getState().parentChildLinks;
        expect(unionsAfter).toEqual(unionsBefore);
        expect(linksAfter).toEqual(linksBefore);
      }),
      { numRuns: 100 },
    );
  });
});
