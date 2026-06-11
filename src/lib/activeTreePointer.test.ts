// Feature: multiple-family-trees, Property 11: Active-tree pointer round-trip
//
// Validates: Requirements 2.2
//
// For any nanoid-shaped string `id`, writing the pointer and then reading it
// returns the same `id`; clearing the pointer causes a subsequent read to
// return `null`. localStorage is reset between iterations so each generated
// input is exercised against a clean slate.
import { beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  clearActiveTreePointer,
  readActiveTreePointer,
  writeActiveTreePointer,
} from './activeTreePointer';

describe('activeTreePointer round-trip', () => {
  beforeEach(() => {
    // Ensure each property iteration runs against an empty pointer, so a
    // residual value from a previous iteration cannot mask a regression.
    window.localStorage.clear();
  });

  // Property 11: Active-tree pointer round-trip
  // For any nanoid-shaped string id, write then read returns id; clear
  // returns null on a subsequent read.
  it('writes and reads back any nanoid-shaped id, and clears to null', () => {
    // Standard nanoid alphabet: A-Z, a-z, 0-9, '_' and '-'. Default nanoid
    // length is 21, but the active-tree pointer only requires a stable
    // string id, so generate the typical 21-char shape used elsewhere in
    // the app while exercising the alphabet boundaries.
    const nanoidLike = fc.stringMatching(/^[A-Za-z0-9_-]{21}$/);

    fc.assert(
      fc.property(nanoidLike, (id) => {
        // Reset between iterations inside the property body too — fast-check
        // does not call beforeEach between predicate invocations within a
        // single `fc.assert` call.
        window.localStorage.clear();

        // Write then read returns the same id.
        writeActiveTreePointer(id);
        expect(readActiveTreePointer()).toBe(id);

        // Clear returns null on subsequent read.
        clearActiveTreePointer();
        expect(readActiveTreePointer()).toBeNull();
      }),
      { numRuns: 100 },
    );
  });
});
