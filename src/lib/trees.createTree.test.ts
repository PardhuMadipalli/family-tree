// Feature: multiple-family-trees, Property 5: Create tree
//
// Validates: Requirements 4.1, 4.3
//
// For any name whose trimmed length is between 1 and 100 inclusive,
// `createTree`:
//   - returns `{ ok: true, tree }` whose `tree.name` equals the trimmed
//     input (Req 4.1),
//   - persists exactly one new entry to the Tree_Registry (count grows
//     by exactly one — Req 4.1, 4.3),
//   - succeeds even when the trimmed name duplicates an existing tree's
//     name (Req 4.3),
//   - associates zero people / unions / parent-child links with the new
//     tree (Req 4.1 — "an empty set of Tree_Records").
//
// Note: Req 4.2 ("set the new Tree as the Active_Tree") is verified by
// the active-tree store's createTree wrapper in a later task; the
// lifecycle service tested here is intentionally headless.
//
// Strategy:
//   - Drive the production `createTree` against the singleton `db`
//     (Dexie + fake-indexeddb).
//   - Each iteration first clears all four tables so the registry and
//     record stores start empty (matches the cascade-delete and scoped
//     reads tests in this directory).
//   - Generate a raw name with random surrounding whitespace whose
//     trimmed length is in [1, 100]. Optionally pre-seed the registry
//     with N prior trees, and for each pre-seeded tree decide whether
//     it should share the candidate's trimmed name — this exercises
//     Req 4.3's "duplicates allowed" clause across many shrinks.
//   - After calling `createTree(rawName)`, assert the result, the
//     registry contents, and that no record-table count changed from
//     the pre-call snapshot.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { nanoid } from 'nanoid';

import { db } from './db';
import { createTree } from './trees';
import type { Tree } from './domain';

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

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * A "trimmed" tree name — a non-empty string with no leading or trailing
 * whitespace, length 1..100 (inclusive). We synthesize this by generating
 * a default printable-ASCII string of length 1..100 and trimming it; the
 * filter rejects pure-whitespace inputs (whose trimmed form is empty) and
 * keeps shrinking simple.
 */
const trimmedNameArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 100 })
  .map((s) => s.trim())
  .filter((s) => s.length >= 1 && s.length <= 100);

/**
 * 0..5 whitespace characters (spaces and tabs) — used to wrap a trimmed
 * name so the property exercises Req 4.1's "after removing leading and
 * trailing whitespace" clause.
 */
const wsArb: fc.Arbitrary<string> = fc.stringOf(
  fc.constantFrom(' ', '\t'),
  { minLength: 0, maxLength: 5 },
);

/**
 * The raw user-typed name: optional whitespace + trimmed name + optional
 * whitespace. By construction `rawName.trim()` equals the inner
 * `trimmedName`, so the test can assert `result.tree.name === trimmed`.
 */
const rawNameArb: fc.Arbitrary<{ raw: string; trimmed: string }> = fc
  .tuple(wsArb, trimmedNameArb, wsArb)
  .map(([prefix, trimmed, suffix]) => ({
    raw: prefix + trimmed + suffix,
    trimmed,
  }));

/** How many trees to pre-seed before calling createTree (0..4). */
const numPriorArb = fc.integer({ min: 0, max: 4 });

/**
 * Per-prior-tree config: whether that tree's stored name should be the
 * candidate's trimmed value (exercising Req 4.3 — duplicates allowed) and
 * an alternative name to use otherwise.
 */
const priorTreeCfgArb = fc.record({
  share: fc.boolean(),
  otherName: trimmedNameArb,
});

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('createTree (Property 5)', () => {
  // Reset before and after the suite so a residual row from a previous
  // test file in the same vitest process cannot influence the result.
  beforeEach(async () => {
    await clearAllTables();
  });
  afterEach(async () => {
    await clearAllTables();
  });

  it('persists a new registry entry with the trimmed name and zero records, even when duplicating an existing name', async () => {
    await fc.assert(
      fc.asyncProperty(fc.gen(), async (g) => {
        const { raw, trimmed } = g(() => rawNameArb);
        const numPrior = g(() => numPriorArb);
        const priorCfgs = Array.from({ length: numPrior }, () =>
          g(() => priorTreeCfgArb),
        );

        // fast-check does not run beforeEach between predicate invocations
        // inside a single fc.assert call, so reset the DB at the start of
        // every iteration.
        await clearAllTables();

        // ---------------- pre-seed registry ----------------
        const baseTime = new Date(Date.UTC(2020, 0, 1)).getTime();
        const priorTrees: Tree[] = priorCfgs.map((cfg, idx) => ({
          id: nanoid(),
          name: cfg.share ? trimmed : cfg.otherName,
          // Distinct, ordered timestamps so each prior tree has a
          // deterministic identity (handy when comparing equality
          // below); the actual values are otherwise immaterial.
          createdAt: new Date(baseTime + (idx + 1) * 1000).toISOString(),
        }));
        if (priorTrees.length > 0) {
          await db.trees.bulkAdd(priorTrees);
        }
        const priorIds = new Set(priorTrees.map((t) => t.id));

        // ---------------- snapshot record-table counts ----------------
        // We never seed records here, so each snapshot is 0; we still
        // record them so the post-condition explicitly asserts "no
        // records added" rather than asserting an absolute zero.
        const peopleSnapshot = await db.people.count();
        const unionsSnapshot = await db.unions.count();
        const linksSnapshot = await db.parentChildLinks.count();

        // ---------------- act ----------------
        const result = await createTree(raw);

        // ---------------- assert: result shape ----------------
        // Req 4.1 — successful creation with the trimmed name.
        expect(result.ok).toBe(true);
        if (!result.ok) return; // type narrowing
        expect(result.tree.name).toBe(trimmed);
        expect(typeof result.tree.id).toBe('string');
        expect(result.tree.id.length).toBeGreaterThan(0);
        // The new id must not collide with any pre-seeded tree id.
        expect(priorIds.has(result.tree.id)).toBe(false);
        // createdAt is an ISO string the registry can round-trip.
        expect(typeof result.tree.createdAt).toBe('string');
        expect(Number.isNaN(Date.parse(result.tree.createdAt))).toBe(false);

        // ---------------- assert: registry persisted ----------------
        // Stored entry equals the returned tree byte-for-byte.
        const storedNew = await db.trees.get(result.tree.id);
        expect(storedNew).toEqual(result.tree);

        // Registry now contains exactly the prior trees plus the new one.
        const allTrees = await db.trees.toArray();
        expect(allTrees).toHaveLength(priorTrees.length + 1);
        // Every prior tree is still present and unchanged.
        for (const pt of priorTrees) {
          expect(await db.trees.get(pt.id)).toEqual(pt);
        }

        // Req 4.3 — when at least one prior tree shares the trimmed name,
        // the registry now contains at least two entries with that exact
        // name (the duplicate succeeded).
        const sharedCount = priorTrees.filter((t) => t.name === trimmed).length;
        if (sharedCount > 0) {
          const sameNameCount = allTrees.filter((t) => t.name === trimmed).length;
          expect(sameNameCount).toBe(sharedCount + 1);
        }

        // ---------------- assert: zero associated records ----------------
        // The new tree has no people / unions / parent-child links.
        expect(
          await db.people.where('treeId').equals(result.tree.id).count(),
        ).toBe(0);
        expect(
          await db.unions.where('treeId').equals(result.tree.id).count(),
        ).toBe(0);
        expect(
          await db.parentChildLinks
            .where('treeId')
            .equals(result.tree.id)
            .count(),
        ).toBe(0);

        // ---------------- assert: no records added globally ----------------
        // Record-table totals are unchanged from the pre-call snapshot —
        // createTree must not touch any of the record tables.
        expect(await db.people.count()).toBe(peopleSnapshot);
        expect(await db.unions.count()).toBe(unionsSnapshot);
        expect(await db.parentChildLinks.count()).toBe(linksSnapshot);
      }),
      { numRuns: 100 },
    );
  });
});
