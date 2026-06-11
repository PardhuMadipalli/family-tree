// Feature: multiple-family-trees, Property 13: Active-tree name truncation
//
// Validates: Requirements 3.1
//
// For names of arbitrary length, the trigger rendered by `<TreeSwitcher />`
// must visually cap the displayed Active_Tree name at ~40 characters.
//
// Why this is a single example test rather than a fast-check property:
//
// The implementation in `src/components/TreeSwitcher.tsx` chose CSS-based
// truncation (`max-w-[40ch] truncate`) over JavaScript string slicing.
// `truncate` resolves to `overflow:hidden; text-overflow:ellipsis;
// white-space:nowrap`, which crops the visible label at the trigger's
// `max-w` boundary and renders the `…` glyph via the rendering engine.
//
// jsdom does not compute layout: `getBoundingClientRect()` returns zeros,
// and elements with `overflow:hidden` still report their full
// `textContent`. There is therefore no DOM-observable signal we can
// compare against the 40-char bound — the bound is enforced visually by
// the browser.
//
// The testable invariant is: the trigger has the truncation styling
// applied. If the classes are present, the truncation behavior holds for
// every possible name once the component is rendered in a real browser
// (CSS is global behavior and does not depend on the input). A single
// example with a deliberately long name is sufficient.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { TreeSwitcher } from './TreeSwitcher';
import { useActiveTreeStore } from '@/lib/activeTreeStore';
import { usePeopleStore } from '@/lib/store';
import { useRelationsStore } from '@/lib/relationsStore';
import type { Tree } from '@/lib/domain';

/**
 * Reset the three Zustand stores so each test starts from a clean slate.
 * Methods on the store are preserved (Zustand `setState` is a partial
 * merge); only the data fields are wiped.
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

describe('TreeSwitcher trigger truncation (Property 13)', () => {
  beforeEach(() => {
    resetStores();
  });

  afterEach(() => {
    cleanup();
    resetStores();
  });

  it('applies CSS truncation styling on the trigger so long active-tree names are visually capped', () => {
    // A 100-char name is well above the 40-char visual cap, ensuring the
    // truncation styling actually has work to do at render time.
    const longName = 'A'.repeat(100);
    const tree: Tree = {
      id: 'tree-long-name',
      name: longName,
      createdAt: '2024-01-01T00:00:00.000Z',
    };

    useActiveTreeStore.setState({
      trees: [tree],
      activeTreeId: tree.id,
      isReady: true,
      status: 'ok',
      error: null,
    });

    render(<TreeSwitcher />);

    // Radix's `SelectTrigger` exposes itself with `role="combobox"`. The
    // component additionally labels it `aria-label="Active tree"` so we
    // could fetch it either way; using the role keeps the assertion
    // resilient to label copy changes.
    const trigger = screen.getByRole('combobox', { name: 'Active tree' });

    // Property 13: the trigger has the CSS-based truncation styling
    // applied. `max-w-[40ch]` caps the trigger's box at ~40 characters of
    // the current font, and `truncate` (Tailwind) collapses any overflow
    // into an ellipsis. Together they implement Req 3.1's "truncating
    // the displayed name beyond 40 characters".
    expect(trigger.className).toContain('max-w-[40ch]');
    expect(trigger.className).toContain('truncate');
  });
});
