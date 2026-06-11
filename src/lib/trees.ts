import { nanoid } from 'nanoid';
import {
  addTree,
  deleteTreeCascade,
  renameTree,
} from './db';
import {
  MAX_TREE_NAME_LENGTH,
  type Id,
  type SchemaEnvelopeV1,
  type StoredParentChild,
  type StoredPerson,
  type StoredUnion,
  type Tree,
} from './domain';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------
//
// The lifecycle service returns explicit, discriminated results so callers
// (the active-tree store and dialog UIs) can branch on `ok` and surface the
// matching validation message without try/catch (Req 4.4, 4.5, 5.3, 5.4).

export type NormalizeResult =
  | { ok: true; name: string }
  | { ok: false; reason: 'empty' | 'too-long' };

export type CreateResult =
  | { ok: true; tree: Tree }
  | { ok: false; reason: 'empty' | 'too-long' };

export type RenameResult =
  | { ok: true }
  | { ok: false; reason: 'empty' | 'too-long' };

// ---------------------------------------------------------------------------
// Name validation
// ---------------------------------------------------------------------------

/**
 * Trim the provided name and validate its length is within the inclusive
 * range 1..MAX_TREE_NAME_LENGTH. Returns the trimmed name on success or a
 * structured rejection on failure (Req 4.1, 4.4, 4.5, 5.1, 5.3, 5.4).
 */
export function normalizeTreeName(raw: string): NormalizeResult {
  const name = raw.trim();
  if (name.length === 0) {
    return { ok: false, reason: 'empty' };
  }
  if (name.length > MAX_TREE_NAME_LENGTH) {
    return { ok: false, reason: 'too-long' };
  }
  return { ok: true, name };
}

// ---------------------------------------------------------------------------
// Lifecycle: create / rename / delete
// ---------------------------------------------------------------------------

/**
 * Create a new tree with the given name. Validates the name first; on
 * success persists a new registry row via `addTree` and returns the tree.
 * Duplicate names are explicitly allowed (Req 4.3).
 */
export async function createTree(name: string): Promise<CreateResult> {
  const normalized = normalizeTreeName(name);
  if (!normalized.ok) {
    return normalized;
  }
  const tree: Tree = {
    id: nanoid(),
    name: normalized.name,
    createdAt: new Date().toISOString(),
  };
  await addTree(tree);
  return { ok: true, tree };
}

/**
 * Rename a tree after validating the new name. The trimmed value is what is
 * persisted (Req 5.1). Records of every tree are left untouched (Req 5.5)
 * — `renameTree` only updates the registry row's `name` field.
 */
export async function renameTreeChecked(
  id: Id,
  name: string,
): Promise<RenameResult> {
  const normalized = normalizeTreeName(name);
  if (!normalized.ok) {
    return normalized;
  }
  await renameTree(id, normalized.name);
  return { ok: true };
}

/**
 * Delete a tree and every record associated with it (cascade). Thin wrapper
 * over `deleteTreeCascade` so the active-tree store has a single, named
 * lifecycle entry point (Req 6.2).
 */
export async function deleteTree(id: Id): Promise<void> {
  await deleteTreeCascade(id);
}

// ---------------------------------------------------------------------------
// Import helpers
// ---------------------------------------------------------------------------

/**
 * Stamp a `treeId` on every record of a portable envelope so it can be
 * persisted as a brand-new tree. Every other field is preserved exactly as
 * it appears in the source envelope (Req 7.4 / Property 16).
 */
export function buildTreeFromEnvelope(
  envelope: SchemaEnvelopeV1,
  treeId: Id,
): {
  people: StoredPerson[];
  unions: StoredUnion[];
  parentChildLinks: StoredParentChild[];
} {
  const people: StoredPerson[] = envelope.people.map((p) => ({ ...p, treeId }));
  const unions: StoredUnion[] = envelope.unions.map((u) => ({ ...u, treeId }));
  const parentChildLinks: StoredParentChild[] = envelope.parentChildLinks.map(
    (l) => ({ ...l, treeId }),
  );
  return { people, unions, parentChildLinks };
}

/**
 * Strip a single trailing file extension (`.json`, `.txt`, ...) from a file
 * name. Treats only the last `.` as the extension separator and only when
 * it follows at least one character (so dotfiles like `.hidden` return as
 * empty after stripping and fall through to the date-derived default).
 */
function stripFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot <= 0) {
    return fileName;
  }
  return fileName.slice(0, lastDot);
}

/**
 * Derive the name to use when importing an envelope as a new tree (Req 7.7,
 * 7.8 / Property 18):
 *   1. If the user typed a non-whitespace name, use that trimmed value.
 *   2. Else, if a source file name is available, use it with its extension
 *      stripped and trimmed; if the stripped result is empty, fall through
 *      to the date-derived default.
 *   3. Otherwise return `Imported tree YYYY-MM-DD` based on today's date.
 */
export function deriveImportTreeName(
  providedName: string | undefined,
  fileName?: string,
): string {
  if (providedName !== undefined) {
    const trimmedProvided = providedName.trim();
    if (trimmedProvided.length > 0) {
      return trimmedProvided;
    }
  }
  if (fileName !== undefined) {
    const trimmedFromFile = stripFileExtension(fileName).trim();
    if (trimmedFromFile.length > 0) {
      return trimmedFromFile;
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  return `Imported tree ${today}`;
}

// ---------------------------------------------------------------------------
// Resolution helpers
// ---------------------------------------------------------------------------

/**
 * Pick the tree with the maximum `createdAt` value, or `undefined` when the
 * registry is empty. Used by active-tree resolution and the never-zero-trees
 * invariant (Req 2.5, 6.3).
 */
export function mostRecentTree(trees: Tree[]): Tree | undefined {
  if (trees.length === 0) {
    return undefined;
  }
  let best = trees[0];
  for (let i = 1; i < trees.length; i += 1) {
    if (trees[i].createdAt > best.createdAt) {
      best = trees[i];
    }
  }
  return best;
}
