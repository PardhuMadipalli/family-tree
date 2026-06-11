// Shared Vitest setup for the family-tree app.
//
// - `fake-indexeddb/auto` polyfills `indexedDB` and `IDBKeyRange` on the
//   global object so Dexie code paths run in-memory under jsdom.
// - `@testing-library/jest-dom` extends Vitest's `expect` with DOM matchers
//   such as `toBeInTheDocument`, `toHaveTextContent`, etc.
// - `localStorage` is polyfilled below because jsdom 25 under recent Node
//   versions does not always initialize `window.localStorage` (the global
//   shows `sessionStorage` but not `localStorage`). The active-tree pointer
//   reads/writes `window.localStorage` directly, so without this polyfill
//   tests against the pointer module would silently no-op.
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

/**
 * Minimal in-memory `Storage` implementation conforming to the Web Storage
 * API surface used by the app (`getItem`, `setItem`, `removeItem`, `clear`,
 * `key`, `length`). Suitable for tests; not for production.
 */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

// Install the polyfill on jsdom's `window` (and on `globalThis` for any
// module that reads `localStorage` as a bare global) only when missing —
// real browsers and properly initialized jsdom environments are left alone.
//
// `localStorage` is defined as a getter on `Window.prototype` in jsdom, so
// `'localStorage' in window` can be true while `window.localStorage` itself
// is `undefined` (or throws) when jsdom's storage subsystem hasn't been
// initialized. Probe the actual value, not membership, before polyfilling.
function readMaybeLocalStorage(target: object): unknown {
  try {
    return (target as { localStorage?: unknown }).localStorage;
  } catch {
    return undefined;
  }
}

if (typeof window !== 'undefined' && readMaybeLocalStorage(window) == null) {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    enumerable: true,
    value: new MemoryStorage(),
    writable: false,
  });
}
if (typeof globalThis !== 'undefined' && readMaybeLocalStorage(globalThis) == null) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    enumerable: true,
    value: (typeof window !== 'undefined' ? window.localStorage : new MemoryStorage()),
    writable: false,
  });
}
