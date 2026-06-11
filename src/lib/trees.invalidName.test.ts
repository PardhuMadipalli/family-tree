// Feature: multiple-family-trees, Property 6: Invalid tree name is rejected without side effects
//
// Validates: Requirements 4.4, 4.5, 5.3, 5.4
//
// For any name whose trimmed length is 0 or greater than 100 (including
// whitespace-only inputs and the boundary length 101), both `createTree`
// and `renameTreeChecked` reject the action and leave the registry, every
// record table (people / unions / parent-child links), the targeted tree's
// existing name, and the Active_Tree pointer unchanged.
//
// Strategy:
//   - Drive the production lifecycle service (`trees.ts`) and the singleton
//     Dexie `db` (backed by fake-indexeddb from the shared test setup).
//     Each iteration starts from a known-empty registry — fast-check does
//     not call `beforeEach` between predicate invocations within a single
//     `fc.assert` call, so the four tables and `localStorage` are cleared
//     at both `beforeEach` and the start of every iteration.
//   - Seed the DB with 1..3 arbitrary-but-valid trees, each carrying a
//     small number of people / unions / parent-child links so the
//     "records unchanged" assertion is meaningful.
//   - Set the Active_Tree pointer to one of the seeded trees so the
//     "Active_Tree unchanged" portion of the property is observable.
//   - Generate invalid names that exercise every reject branch of
//     `normalizeTreeName`:
//       1. the empty string (trimmed length 0);
//       2. whitespace-only strings (trimmed length 0);
//       3. names whose trimmed length is in [101, 200] (including the
//          inclusive-upper-bound boundary 101).
//   - Snapshot the full DB state plus the pointer; invoke first
//     `createTree(invalidName)` and then `renameTreeChecked(targetId,
//     invalidName)`; after each call assert the result is `{ok:false}`
//     with the spec-defined reason and that every snapshot still matches
//     byte-for-byte.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { nanoid } from 'nanoid';

import { db } from './db';
import {
  readActiveTreePointer,
  writeActiveTreePointer,
} from './activeTreePointer';
import { createTree, renameTreeChecked } from './trees';
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

/** Stable sort by `id` so two record sets can be compared with `toEqual`. */
function sortById<T extends { id: string }>(xs: readonly T[]): T[] {
  return [...xs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Single-character whitespace alphabet used to build whitespace-only
 * names and the optional padding around too-long names. Mirrors the
 * character classes that JavaScript's `String.prototype.trim` strips.
 */
const whitespaceCharArb = fc.constantFrom(' ', '\t', '\n', '\r');

/** The empty string — trims to length 0 → reason 'empty'. */
const emptyNameArb = fc.constant('');

/**
 * A non-empty string composed only of whitespace characters. Trims to an
 * empty string regardless of input length, so always rejected with
 * reason 'empty' (Req 4.4 / 5.3).
 */
const whitespaceOnlyNameArb = fc
  .array(whitespaceCharArb, { minLength: 1, maxLength: 10 })
  .map((chars) => chars.join(''));

/**
 * A name whose trimmed length is in [101, 200] — i.e. above the inclusive
 * upper bound `MAX_TREE_NAME_LENGTH` (100). The body is a single
 * non-whitespace BMP code point repeated to length `bodyLen`, optionally
 * surrounded by whitespace. After trim, length equals `bodyLen` (the
 * surrounding whitespace is stripped but the body is preserved), so the
 * input is always rejected with reason 'too-long' (Req 4.5 / 5.4).
 *
 * `bodyLen` deliberately includes 101 to exercise the boundary.
 */
const tooLongNameArb = fc
  .record({
    bodyLen: fc.integer({ min: 101, max: 200 }),
    bodyChar: fc.constantFrom('a', 'B', '1', 'ñ', 'あ'),
    leading: fc
      .array(whitespaceCharArb, { minLength: 0, maxLength: 5 })
      .map((cs) => cs.join('')),
    trailing: fc
      .array(whitespaceCharArb, { minLength: 0, maxLength: 5 })
      .map((cs) => cs.join('')),
  })
  .map(({ bodyLen, bodyChar, leading, trailing }) => {
    const body = bodyChar.repeat(bodyLen);
    return `${leading}${body}${trailing}`;
  });

/** Union of every reject path. Weights bias toward too-long because it
 * carries the boundary-condition coverage for `MAX_TREE_NAME_LENGTH`. */
const invalidNameArb = fc.oneof(
  { weight: 1, arbitrary: emptyNameArb },
  { weight: 2, arbitrary: whitespaceOnlyNameArb },
  { weight: 3, arbitrary: tooLongNameArb },
);

/**
 * Per-tree config in the seeded registry. Counts are kept tiny so each
 * iteration runs quickly under fake-indexeddb while still exercising the
 * "records left unchanged" portion of the property.
 */
const treeConfigArb = fc.record({
  // Valid seed name: trimmed-length 1..30. The property is not about name
  // generation, so we keep this generator cheap — but a non-trivial name
  // still lets the rename assertion catch silent overwrites.
  name: fc.string({ minLength: 1, maxLength: 30 }).filter(
    (s) => s.trim().length >= 1 && s.trim().length <= 30,
  ),
  numPeople: fc.integer({ min: 0, max: 2 }),
  numUnions: fc.integer({ min: 0, max: 2 }),
  numLinks: fc.integer({ min: 0, max: 2 }),
});

/**
 * Whole scenario: 1..3 trees, two `nat` offsets we mod by `trees.length`
 * to choose the rename target and the Active_Tree pointer (so the active
 * pointer is always set to a valid seeded tree), plus the invalid name
 * under test.
 */
const scenarioArb = fc.record({
  trees: fc.array(treeConfigArb, { minLength: 1, maxLength: 3 }),
  renameOffset: fc.nat({ max: 1_000 }),
  activeOffset: fc.nat({ max: 1_000 }),
  invalidName: invalidNameArb,
});

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('invalid tree name rejection (Property 6)', () => {
  beforeEach(async () => {
    await clearAllTables();
    window.localStorage.clear();
  });
  afterEach(async () => {
    await clearAllTables();
    window.localStorage.clear();
  });

  // Property 6: Invalid tree name is rejected without side effects
  // For any invalid name (trimmed length 0 or > 100), both createTree
  // and renameTreeChecked return {ok:false} with a matching reason, and
  // the registry, all record tables, the target tree's existing name,
  // and the Active_Tree pointer remain byte-for-byte unchanged.
  it('createTree and renameTreeChecked reject invalid names and leave registry, records, target name, and Active_Tree unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(
        scenarioArb,
        async ({
          trees: treeCfgs,
          renameOffset,
          activeOffset,
          invalidName,
        }) => {
          // Per-iteration reset: fast-check does not call beforeEach
          // between predicate invocations inside a single fc.assert call.
          await clearAllTables();
          window.localStorage.clear();

          // -------------------------------------------------------------
          // Build seed registry + records.
          // -------------------------------------------------------------
          const trees: Tree[] = [];
          const allPeople: StoredPerson[] = [];
          const allUnions: StoredUnion[] = [];
          const allLinks: StoredParentChild[] = [];

          treeCfgs.forEach((cfg, ti) => {
            const tree: Tree = {
              id: nanoid(),
              name: cfg.name,
              // Distinct timestamps per tree so the registry has a
              // well-defined ordering (also makes any silent name swap
              // visible in `db.trees.toArray()` snapshots).
              createdAt: new Date(2020, 0, 1 + ti).toISOString(),
            };
            trees.push(tree);

            for (let i = 0; i < cfg.numPeople; i += 1) {
              allPeople.push({
                id: nanoid(),
                treeId: tree.id,
                givenName: `p${ti}-${i}`,
                createdAt: '2020-01-01T00:00:00.000Z',
                updatedAt: '2020-01-01T00:00:00.000Z',
              });
            }
            for (let i = 0; i < cfg.numUnions; i += 1) {
              allUnions.push({
                id: nanoid(),
                treeId: tree.id,
                partnerIds: [nanoid(), nanoid()],
                notes: `u${ti}-${i}`,
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

          // Persist seed atomically so setup is fast and consistent.
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
              if (allLinks.length > 0)
                await db.parentChildLinks.bulkAdd(allLinks);
            },
          );

          // Set the Active_Tree pointer to one of the seeded trees so a
          // later assertion can confirm it has not changed.
          const activeTree = trees[activeOffset % trees.length];
          writeActiveTreePointer(activeTree.id);

          // -------------------------------------------------------------
          // Snapshot the full DB state + pointer for byte-for-byte
          // comparison after each rejected operation.
          // -------------------------------------------------------------
          const snapshotTrees = sortById(await db.trees.toArray());
          const snapshotPeople = sortById(await db.people.toArray());
          const snapshotUnions = sortById(await db.unions.toArray());
          const snapshotLinks = sortById(await db.parentChildLinks.toArray());
          const snapshotPointer = readActiveTreePointer();

          // -------------------------------------------------------------
          // The reason `normalizeTreeName` should return for the
          // generated invalid input. Defined by the spec:
          //   trimmed length 0   -> 'empty' (Req 4.4 / 5.3)
          //   trimmed length>100 -> 'too-long' (Req 4.5 / 5.4)
          // -------------------------------------------------------------
          const trimmedLen = invalidName.trim().length;
          const expectedReason: 'empty' | 'too-long' =
            trimmedLen === 0 ? 'empty' : 'too-long';

          // -------------------------------------------------------------
          // Action 1: createTree(invalidName) must reject.
          // -------------------------------------------------------------
          const createResult = await createTree(invalidName);
          expect(createResult.ok).toBe(false);
          if (!createResult.ok) {
            expect(createResult.reason).toBe(expectedReason);
          }

          // No DB or pointer side-effects after the rejected createTree.
          expect(sortById(await db.trees.toArray())).toEqual(snapshotTrees);
          expect(sortById(await db.people.toArray())).toEqual(snapshotPeople);
          expect(sortById(await db.unions.toArray())).toEqual(snapshotUnions);
          expect(sortById(await db.parentChildLinks.toArray())).toEqual(
            snapshotLinks,
          );
          expect(readActiveTreePointer()).toBe(snapshotPointer);

          // -------------------------------------------------------------
          // Action 2: renameTreeChecked(targetId, invalidName) must reject.
          // -------------------------------------------------------------
          const target = trees[renameOffset % trees.length];
          const renameResult = await renameTreeChecked(target.id, invalidName);
          expect(renameResult.ok).toBe(false);
          if (!renameResult.ok) {
            expect(renameResult.reason).toBe(expectedReason);
          }

          // The targeted tree's stored name is unchanged.
          const storedTarget = await db.trees.get(target.id);
          expect(storedTarget).toBeDefined();
          expect(storedTarget!.name).toBe(target.name);

          // Full DB + pointer still byte-for-byte equal to the original
          // snapshot — neither rejected action introduced any change.
          expect(sortById(await db.trees.toArray())).toEqual(snapshotTrees);
          expect(sortById(await db.people.toArray())).toEqual(snapshotPeople);
          expect(sortById(await db.unions.toArray())).toEqual(snapshotUnions);
          expect(sortById(await db.parentChildLinks.toArray())).toEqual(
            snapshotLinks,
          );
          expect(readActiveTreePointer()).toBe(snapshotPointer);
        },
      ),
      { numRuns: 100 },
    );
  });
});
