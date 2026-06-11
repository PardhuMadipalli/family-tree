import Dexie, { Table, Transaction } from 'dexie';
import { nanoid } from 'nanoid';
import {
  DEFAULT_TREE_NAME,
  type Id,
  type StoredParentChild,
  type StoredPerson,
  type StoredUnion,
  type Tree,
} from './domain';

export class FamilyTreeDB extends Dexie {
  trees!: Table<Tree, Id>;
  // People / unions / parent-child-links are keyed on a compound primary
  // key `[id, treeId]` from v3 onward, so the same record id may appear
  // independently in multiple trees (e.g., when an exported tree is
  // re-imported as a new tree alongside the original). The TS key type is
  // `[Id, Id]` to reflect the tuple shape Dexie expects for compound-key
  // operations like `table.get([id, treeId])` / `update([id, treeId], …)`
  // / `delete([id, treeId])`.
  people!: Table<StoredPerson, [Id, Id]>;
  unions!: Table<StoredUnion, [Id, Id]>;
  parentChildLinks!: Table<StoredParentChild, [Id, Id]>;

  constructor() {
    super('family-tree-db');

    // v1: original single-tree schema (kept for the upgrade chain).
    this.version(1).stores({
      people: 'id, givenName, familyName, createdAt, updatedAt',
      unions: 'id, createdAt, updatedAt',
      parentChildLinks: 'id, childId',
    });

    // v2: add the trees registry table and a treeId index on every record
    // store so reads/deletes can be scoped to a single tree. Inside the
    // upgrade callback, any pre-existing single-tree records (no treeId set)
    // are atomically adopted into a Default_Tree named DEFAULT_TREE_NAME via
    // `migrateLegacyRecordsToDefaultTree`. Dexie persists the installed
    // schema version, so the upgrade runs at most once per browser — this
    // also serves as the durable migration-completed indicator (Req 8.5).
    this.version(2).stores({
      trees: 'id, createdAt',
      people: 'id, treeId, givenName, familyName, createdAt, updatedAt',
      unions: 'id, treeId, createdAt, updatedAt',
      parentChildLinks: 'id, treeId, childId',
    }).upgrade(async (tx) => {
      await migrateLegacyRecordsToDefaultTree(tx);
    });

    // v3: switch the primary key on the three record stores to the
    // compound `[id+treeId]`. Required because record ids are only unique
    // within a tree — when an exported tree is re-imported as a sibling
    // tree, its record ids collide with the originals and a single-column
    // `id` primary key would reject the import with a ConstraintError
    // (violates Req 9.3 round-trip). With `[id+treeId]` the same id can
    // legitimately appear once per tree.
    //
    // The portable `id` is kept as a secondary index so existing code can
    // still query by id when scoped to a known tree. Other secondary
    // indexes (treeId, givenName, etc.) are preserved unchanged so all
    // current `.where('treeId').equals(...)` reads keep working.
    //
    // No upgrade callback is needed: every record reaching v3 already
    // carries `treeId` (stamped by the v1→v2 migration or written that way
    // by post-v2 code paths), so Dexie re-indexes the rows in place onto
    // the new compound primary key without any data rewrite of our own.
    this.version(3).stores({
      trees: 'id, createdAt',
      people: '[id+treeId], treeId, givenName, familyName, createdAt, updatedAt, id',
      unions: '[id+treeId], treeId, createdAt, updatedAt, id',
      parentChildLinks: '[id+treeId], treeId, childId, id',
    });
  }
}

export const db = new FamilyTreeDB();

// ---------------------------------------------------------------------------
// v1 -> v2 migration: adopt pre-existing single-tree records into a
// Default_Tree named DEFAULT_TREE_NAME.
// ---------------------------------------------------------------------------
//
// Runs inside `version(2).upgrade(tx)`. The whole body executes inside the
// upgrade transaction, so any throw aborts atomically: schema stays at v1,
// no Default_Tree is created, and no record is partially updated. This
// satisfies Req 8.6 (and makes the schema version itself the durable
// migration-completed indicator for Req 8.5).
//
// Behavior contract (Req 8.1, 8.3, 8.4):
//   1. Find all records in `people`/`unions`/`parentChildLinks` whose
//      `treeId` is undefined (pre-multi-tree shape).
//   2. If none exist, return without creating a tree — fresh installs go
//      through `bootstrap()`'s empty-registry branch instead (Req 2.6).
//   3. Otherwise create exactly one Default_Tree row in `trees`.
//   4. For each legacy record, set ONLY `treeId` via `tx.table(...).update`
//      — every other field is left untouched, and no record is added or
//      removed.
//
// Exported so tasks 3.3 / 3.4 can drive it directly under `fake-indexeddb`.
export async function migrateLegacyRecordsToDefaultTree(
  tx: Transaction,
): Promise<void> {
  // Read every row in each store and partition out the legacy ones (those
  // without a `treeId`). Doing this inside the upgrade transaction means the
  // reads see the v2 schema shape, but legacy rows still carry no `treeId`
  // until we stamp it below.
  const [people, unions, parentChildLinks] = await Promise.all([
    tx.table('people').toArray(),
    tx.table('unions').toArray(),
    tx.table('parentChildLinks').toArray(),
  ]);

  const legacyPeople = people.filter((r) => r.treeId === undefined);
  const legacyUnions = unions.filter((r) => r.treeId === undefined);
  const legacyParentChildLinks = parentChildLinks.filter(
    (r) => r.treeId === undefined,
  );

  if (
    legacyPeople.length === 0 &&
    legacyUnions.length === 0 &&
    legacyParentChildLinks.length === 0
  ) {
    // Fresh install (or already-migrated DB): nothing to adopt. Bootstrap
    // is responsible for creating the first tree on truly empty registries.
    return;
  }

  const defaultTree: Tree = {
    id: nanoid(),
    name: DEFAULT_TREE_NAME,
    createdAt: new Date().toISOString(),
  };
  await tx.table('trees').add(defaultTree);

  // Stamp `treeId` on every legacy record. Using `update` with a partial
  // patch guarantees only `treeId` is modified — other fields are preserved
  // byte-for-byte (Req 8.3). Records are neither created nor deleted here
  // (Req 8.4).
  for (const r of legacyPeople) {
    await tx.table('people').update(r.id, { treeId: defaultTree.id });
  }
  for (const r of legacyUnions) {
    await tx.table('unions').update(r.id, { treeId: defaultTree.id });
  }
  for (const r of legacyParentChildLinks) {
    await tx
      .table('parentChildLinks')
      .update(r.id, { treeId: defaultTree.id });
  }
}

// ---------------------------------------------------------------------------
// Tree_Registry CRUD
// ---------------------------------------------------------------------------

/** Returns all trees ordered by createdAt with the most recently created first. */
export async function getAllTrees(): Promise<Tree[]> {
  return db.trees.orderBy('createdAt').reverse().toArray();
}

export async function addTree(tree: Tree): Promise<void> {
  await db.trees.add(tree);
}

export async function renameTree(id: Id, name: string): Promise<void> {
  await db.trees.update(id, { name });
}

/**
 * Atomically remove a tree and every record (people, unions, parent-child
 * links) associated with that tree's id. Runs in a single rw transaction so
 * the operation is all-or-nothing (Req 1.7, 6.2).
 */
export async function deleteTreeCascade(id: Id): Promise<void> {
  await db.transaction(
    'rw',
    db.trees,
    db.people,
    db.unions,
    db.parentChildLinks,
    async () => {
      await db.trees.delete(id);
      await db.people.where('treeId').equals(id).delete();
      await db.unions.where('treeId').equals(id).delete();
      await db.parentChildLinks.where('treeId').equals(id).delete();
    },
  );
}

// ---------------------------------------------------------------------------
// Scoped record reads (Req 1.3)
// ---------------------------------------------------------------------------

export async function getPeopleByTree(treeId: Id): Promise<StoredPerson[]> {
  return db.people.where('treeId').equals(treeId).toArray();
}

export async function getUnionsByTree(treeId: Id): Promise<StoredUnion[]> {
  return db.unions.where('treeId').equals(treeId).toArray();
}

export async function getParentChildLinksByTree(treeId: Id): Promise<StoredParentChild[]> {
  return db.parentChildLinks.where('treeId').equals(treeId).toArray();
}

// ---------------------------------------------------------------------------
// People CRUD
// ---------------------------------------------------------------------------

export async function getAllPeople(): Promise<StoredPerson[]> {
  return db.people.orderBy('givenName').toArray();
}

export async function addPerson(person: StoredPerson): Promise<void> {
  await db.people.add(person);
}

export async function updatePerson(
  personId: Id,
  treeId: Id,
  updates: Partial<StoredPerson>,
): Promise<void> {
  // Compound primary key (`[id+treeId]`) — Dexie expects the key as a
  // tuple. Scoping to `treeId` also keeps the update unambiguous when the
  // same record id legitimately exists in multiple trees (e.g., after an
  // export/re-import as a sibling tree).
  await db.people.update([personId, treeId], updates);
}

export async function deletePerson(personId: Id, treeId: Id): Promise<void> {
  await db.people.delete([personId, treeId]);
}

// ---------------------------------------------------------------------------
// Unions CRUD
// ---------------------------------------------------------------------------

export async function getAllUnions(): Promise<StoredUnion[]> {
  return db.unions.toArray();
}

export async function addUnion(union: StoredUnion): Promise<void> {
  await db.unions.add(union);
}

export async function updateUnion(
  unionId: Id,
  treeId: Id,
  updates: Partial<StoredUnion>,
): Promise<void> {
  await db.unions.update([unionId, treeId], updates);
}

export async function deleteUnion(unionId: Id, treeId: Id): Promise<void> {
  await db.unions.delete([unionId, treeId]);
}

// ---------------------------------------------------------------------------
// Parent-Child Links CRUD
// ---------------------------------------------------------------------------

export async function getAllParentChildLinks(): Promise<StoredParentChild[]> {
  return db.parentChildLinks.toArray();
}

export async function addParentChildLink(link: StoredParentChild): Promise<void> {
  await db.parentChildLinks.add(link);
}

export async function deleteParentChildLink(linkId: Id, treeId: Id): Promise<void> {
  await db.parentChildLinks.delete([linkId, treeId]);
}
