// Component test: TreeSwitcher shows the active marker on the active option
//
// Validates: Requirements 3.6
//
// With multiple trees in the registry, render the switcher and assert
// exactly one option has the check-mark indicator and that option
// corresponds to `activeTreeId`.
//
// Strategy
// --------
// shadcn's `SelectItem` (see `src/components/ui/select.tsx`) wraps
// Radix's `SelectPrimitive.Item` and renders the lucide `CheckIcon`
// inside `SelectPrimitive.ItemIndicator`. Radix only mounts the
// indicator's children when the item matches the controlled value, and
// it also sets `aria-selected="true"` on that single option. The
// approach the task description suggests is to query options via
// `getAllByRole('option')`, filter on `aria-selected="true"`, and
// assert exactly one match whose text equals the active tree's name.
//
// jsdom + Radix Select notes
// --------------------------
// Radix's Select primitive relies on Pointer Events and a few DOM
// methods that jsdom does not implement (`hasPointerCapture`,
// `releasePointerCapture`, `setPointerCapture`, `scrollIntoView`).
// Without polyfills the trigger click silently no-ops. The setup block
// below patches those methods with `vi.fn()` so the dropdown opens and
// `screen.getAllByRole('option')` resolves the options Radix portals
// into `document.body`. (Mirrors the polyfill in
// `TreeSwitcher.ordering.test.tsx`.)

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = vi.fn(() => false);
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = vi.fn();
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = vi.fn();
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn();
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Reset the three Zustand stores back to their initial state between
 * iterations. Action functions are preserved (Zustand's `setState` does
 * a partial merge); only the data fields are wiped.
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
// Test
// ---------------------------------------------------------------------------

describe('TreeSwitcher active marker', () => {
  beforeEach(() => {
    resetStores();
  });

  afterEach(() => {
    cleanup();
    resetStores();
  });

  // Validates: Requirements 3.6
  // The Tree_Switcher visually indicates which Tree in the list is the
  // Active_Tree.
  it('marks exactly one option as active and it corresponds to activeTreeId', async () => {
    // Three trees in the registry. The store contract is that `trees[]`
    // is sorted by `createdAt` desc, so seed them in that order. Pick
    // the second tree as the Active_Tree to confirm the marker tracks
    // `activeTreeId` rather than just the first or last option.
    const trees: Tree[] = [
      {
        id: nanoid(),
        name: 'Smith Family',
        createdAt: '2024-03-01T00:00:00.000Z',
      },
      {
        id: nanoid(),
        name: 'Johnson Family',
        createdAt: '2024-02-01T00:00:00.000Z',
      },
      {
        id: nanoid(),
        name: 'Garcia Family',
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ];
    const activeTree = trees[1];

    useActiveTreeStore.setState({
      trees,
      activeTreeId: activeTree.id,
      isReady: true,
      status: 'ok',
      error: null,
    });

    render(<TreeSwitcher />);

    // Open the dropdown. The Radix Select trigger has role="combobox"
    // and the component sets aria-label="Active tree".
    const user = userEvent.setup();
    const trigger = screen.getByRole('combobox', { name: 'Active tree' });
    await user.click(trigger);

    // Radix portals the options to document.body; `screen` queries the
    // entire document so options resolve regardless of the portal.
    // findAllByRole waits for the open animation/state to settle.
    const allOptions = await screen.findAllByRole('option');

    // The dropdown contains three tree options plus three action items
    // (`New tree…`, `Rename current tree…`, `Delete current tree…`).
    // Action items use sentinel values that never match the controlled
    // `activeTreeId`, so they never carry `aria-selected="true"`.
    const selectedOptions = allOptions.filter(
      (el) => el.getAttribute('aria-selected') === 'true',
    );

    // Exactly one option is marked as the Active_Tree.
    expect(selectedOptions).toHaveLength(1);

    // The marked option is the one whose text matches the active tree's
    // name (the option's `value` is the active tree id, which Radix
    // does not expose to the DOM as a queryable attribute, so we
    // identify the option by its rendered text).
    expect(selectedOptions[0].textContent).toBe(activeTree.name);
  });
});
