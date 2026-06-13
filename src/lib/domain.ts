export type Id = string;

// Date fields below use the FuzzyDate shape ("YYYY", "YYYY-MM", or
// "YYYY-MM-DD"). See `src/lib/fuzzyDate.ts` for parse/format helpers. Plain
// `string` is kept here so the portable export envelope stays unchanged and
// older `YYYY-MM-DD` data continues to validate.
export interface PersonV1 {
  id: Id;
  givenName: string;
  familyName?: string;
  birthDate?: string; // FuzzyDate
  deathDate?: string; // FuzzyDate
  gender?: 'male' | 'female' | 'other' | 'unknown';
  notes?: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface UnionV1 {
  id: Id;
  partnerIds: Id[]; // typically 2
  startDate?: string; // FuzzyDate
  endDate?: string; // FuzzyDate
  notes?: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface ParentChildV1 {
  id: Id;
  parentIds: Id[]; // 1 or 2 parents
  childId: Id;
}

export interface SchemaEnvelopeV1 {
  version: 1;
  people: PersonV1[];
  unions: UnionV1[];
  parentChildLinks: ParentChildV1[];
}

// ---------------------------------------------------------------------------
// Multi-tree types and constants
// ---------------------------------------------------------------------------
//
// `PersonV1`, `UnionV1`, `ParentChildV1`, and `SchemaEnvelopeV1` above remain
// the portable shapes used inside export/import files — they intentionally do
// NOT carry a `treeId`. The persisted (Dexie) shapes below add a `treeId`
// association via `Scoped<T>` so each record belongs to exactly one Tree.

/** A single named family tree in the Tree_Registry. */
export interface Tree {
  id: Id;            // unique across the registry
  name: string;      // 1..100 chars (trimmed); duplicates allowed
  createdAt: string; // ISO timestamp
}

/** Helper that adds a tree association to a portable record shape. */
export type Scoped<T> = T & { treeId: Id };

/** Persisted person record (portable + treeId association). */
export type StoredPerson = Scoped<PersonV1>;

/** Persisted union record (portable + treeId association). */
export type StoredUnion = Scoped<UnionV1>;

/** Persisted parent-child link record (portable + treeId association). */
export type StoredParentChild = Scoped<ParentChildV1>;

/** Maximum allowed length of a tree's display name (after trimming). */
export const MAX_TREE_NAME_LENGTH = 100;

/** Default name used for the Default_Tree and the never-zero-trees fallback. */
export const DEFAULT_TREE_NAME = 'My Family Tree';
