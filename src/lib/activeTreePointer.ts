import type { Id } from './domain';

/**
 * Storage key for the persisted Active_Tree_Pointer (Req 2.2, design §
 * "Persistence Map"). The pointer is a tiny scalar that must survive page
 * reloads and be readable synchronously at app startup, so it lives in
 * `localStorage` rather than IndexedDB.
 */
const STORAGE_KEY = 'family-tree:active-tree-id';

/**
 * Resolves to the browser's `localStorage` when it is reachable, or `null`
 * during server-side rendering (no `window`) and in privacy/security contexts
 * where merely accessing `window.localStorage` can throw.
 *
 * Kept as a function (rather than evaluated at module load) so this module is
 * safe to import on the server — no `window` access happens at module top
 * level.
 */
function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    // Some browsers throw on the getter when storage is disabled (e.g.
    // strict cookie/storage settings). Treat it as unavailable.
    return null;
  }
}

/**
 * Reads the persisted Active_Tree_Pointer.
 *
 * Returns `null` when:
 *   - storage is unavailable (SSR or storage disabled),
 *   - no pointer has been written yet, or
 *   - the read itself throws for any reason.
 *
 * Never throws. Callers can rely on the resolution flow (design §
 * "Startup / Active-Tree Resolution Flow") to fall back to the most-recent
 * tree when this returns `null`.
 */
export function readActiveTreePointer(): Id | null {
  const storage = getLocalStorage();
  if (!storage) return null;
  try {
    return storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Writes the Active_Tree_Pointer.
 *
 * Lets quota/security errors propagate so callers can satisfy Req 2.7
 * ("retain the current Active_Tree for the session and present an error
 * indication that the selection could not be saved").
 *
 * Silently no-ops during server-side rendering where `window` is unavailable
 * — there is no user session to surface an error to in that environment.
 */
export function writeActiveTreePointer(id: Id): void {
  const storage = getLocalStorage();
  if (!storage) return;
  storage.setItem(STORAGE_KEY, id);
}

/**
 * Removes the persisted Active_Tree_Pointer. Best-effort: failures while
 * clearing are swallowed because the store can always re-resolve a valid
 * Active_Tree from the registry on next bootstrap.
 */
export function clearActiveTreePointer(): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Best-effort: clearing should not propagate errors.
  }
}
