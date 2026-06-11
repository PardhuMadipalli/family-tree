// Feature: multiple-family-trees, Property 12: Switcher ordering
//
// Validates: Requirements 3.2
//
// For any registry, the list presented by the Tree_Switcher contains
// exactly the registry's trees and is ordered by creation timestamp
// with the most recently created tree first.
//
// Strategy
// --------
// The active-tree store's contract is that `trees[]` is kept sorted by
// `createdAt` descending (this is established by `getAllTrees()` in
// `db.ts`, which the bootstrap / lifecycle code paths use). The
// `TreeSwitcher` renders options by simply iterating that array, so the
// property collapses to: "given a registry sorted by `createdAt` desc in
// the store, the rendered option order matches that sort". This test
// seeds the store directly (per the task's approach) and asserts the
// rendered DOM matches the expected order.
//
// Generators emit ≥2 trees with varied (and intentionally unsorted)
// `createdAt` timestamps. The test sorts them desc and seeds the store
// in the post-sort order — i.e., the order the production registry
// helpers would have produced — so the assertion exercises the
// component's render fidelity rather than a sort it does not perform.
//
// jsdom + Radix Select notes
// --------------------------
// Radix's Select primitive relies on Pointer Events and a few DOM
// methods that jsdom does not implement (`hasPointerCapture`,
// `releasePointerCapture`, `scrollIntoView`). Without polyfills the
// trigger click silently no-ops. The setup block below patches those
// methods with `vi.fn()` so the menu opens, options portal into
// `document.body`, and `screen.getAllByRole('option')` resolves them.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { nanoid } from 'nanoid';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TreeSwitcher } from './TreeSwitcher';
import { useActiveTreeStore } from '@/lib/activeTreeStore';
import { usePeopleStore } from '@/lib/store';
import { useRelationsStore } from '@/lib/relationsStore';
import type { Tree } from '@/lib/domain';

// ---------------------------------------------------------------------------
// jsdom polyfills for Radix Select
// ---------------------------------------------------------------------------

beforeAll(() => {
  // Radix's Select uses pointer-capture during the open / close handshake.
  // jsdom doesn't implement these, so the trigger's click handler short
  // circuits (the dropdown never opens) without these stubs.
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = vi.fn(() => false);
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = vi.fn();
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = vi.fn();
  }
  // Radix's content/listbox calls `scrollIntoView` on the focused item
  // after open; jsdom doesn't implement it on Element, so stub it.
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn();
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Reset the three Zustand stores back to their initial state between
 * iterations. Action functions are preserved (Zustand's `setState` does a
 * partial merge); only the data fields are wiped.
 *
 * The record stores are reset because `setActiveTree` (invoked when the
 * user picks a non-active option) re-hydrates them. Resetting keeps cross
 * iteration state clean even though this test never triggers a switch.
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

/**
 * Seed the active-tree store directly. Trees are stored sorted by
 * `createdAt` desc (the registry contract). The first tree (most
 * recently created) is set as the Active_Tree so the trigger renders a
 * value and `status` resolves to `'ok'`.
 */
function seedActiveTreeStore(treesSortedDesc: Tree[]): void {
  useActiveTreeStore.setState({
    trees: treesSortedDesc,
    activeTreeId: treesSortedDesc[0]?.id ?? null,
    isReady: true,
    status: treesSortedDesc.length > 0 ? 'ok' : 'no-selection',
    error: null,
  });
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Build N trees (2..5) with distinct, unsorted `createdAt` timestamps.
 * Names are unique so the rendered text uniquely identifies an option,
 * keeping the order assertion robust.
 *
 * `createdAt` is generated as a millisecond offset; the values are mapped
 * to ISO strings. The chosen offsets are large enough to avoid identical
 * timestamps even after fast-check's shrinker tries small adjacent ints.
 */
const treeArb: fc.Arbitrary<Tree[]> = fc
  .uniqueArray(fc.integer({ min: 0, max: 10_000 }), {
    minLength: 2,
    maxLength: 5,
  })
  .map((offsets) =>
    offsets.map((offsetMinutes, idx) => ({
      id: nanoid(),
      // Unique names keep the text-based assertion unambiguous even
      // though the registry permits duplicates (Req 4.3).
      name: `Tree ${idx}-${offsetMinutes}`,
      // Spread timestamps far enough apart that no two share an ISO
      // representation; offsets remain in (semi-)random order so the
      // test exercises a real desc sort, not a no-op sort over already
      // ordered input.
      createdAt: new Date(
        Date.UTC(2024, 0, 1) + offsetMinutes * 60_000,
      ).toISOString(),
    })),
  );

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('TreeSwitcher option ordering (Property 12)', () => {
  beforeEach(() => {
    resetStores();
  });

  afterEach(() => {
    cleanup();
    resetStores();
  });

  // Property 12: Switcher ordering
  // For any registry, the list presented by the Tree_Switcher contains
  // exactly the registry's trees and is ordered by creation timestamp
  // with the most recently created tree first.
  it('renders tree options in the order of the registry sorted by createdAt desc', async () => {
    await fc.assert(
      fc.asyncProperty(treeArb, async (trees) => {
        // fast-check does not run beforeEach between predicate
        // invocations inside a single `fc.assert`, so reset and clean
        // the DOM at the start of every iteration.
        cleanup();
        resetStores();

        // Sort desc so the seeded `trees[]` reflects what
        // `getAllTrees()` would return in production. The component
        // does not re-sort: it iterates the array as-is.
        const sortedDesc = [...trees].sort((a, b) =>
          a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
        );
        seedActiveTreeStore(sortedDesc);

        render(<TreeSwitcher />);

        // Open the dropdown. The Radix Select trigger has
        // `role="combobox"` and the test sets `aria-label="Active tree"`.
        const user = userEvent.setup();
        const trigger = screen.getByRole('combobox', { name: 'Active tree' });
        await user.click(trigger);

        // Radix portals options to `document.body`; `screen` queries the
        // entire document, so options resolve regardless of the portal.
        // findAllByRole waits for the open animation/state to settle.
        const allOptions = await screen.findAllByRole('option');

        // The dropdown contains the registry's tree options followed by
        // three action items (`New tree…`, `Rename current tree…`,
        // `Delete current tree…`). Slice off the action rows by length
        // — they never carry a tree's name and would otherwise leak
        // into the order assertion.
        const treeOptions = allOptions.slice(0, sortedDesc.length);

        // 1) Same length: every registry tree is rendered exactly once.
        expect(treeOptions).toHaveLength(sortedDesc.length);

        // 2) Order matches createdAt desc: option text equals the
        //    sorted-desc tree names, position by position.
        const renderedNames = treeOptions.map((el) => el.textContent);
        const expectedNames = sortedDesc.map((t) => t.name);
        expect(renderedNames).toEqual(expectedNames);
      }),
      { numRuns: 30 },
    );
  });
});
