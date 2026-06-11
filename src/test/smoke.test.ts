// Smoke test: confirms the Vitest scaffold (vitest.config.ts + setup.ts +
// `npm test` script) is wired up and can execute a trivial assertion.
// If this test runs and passes, `npm test` exits 0 and the rest of the
// multi-tree property tests can be added on top of this scaffold.
import { describe, expect, it } from 'vitest';

describe('vitest scaffold smoke test', () => {
  it('runs a trivial assertion', () => {
    expect(1 + 1).toBe(2);
  });
});
