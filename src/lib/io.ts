import {
  db,
  getParentChildLinksByTree,
  getPeopleByTree,
  getUnionsByTree,
} from './db';
import type {
  Id,
  ParentChildV1,
  PersonV1,
  SchemaEnvelopeV1,
  StoredParentChild,
  StoredPerson,
  StoredUnion,
  UnionV1,
} from './domain';

export type ImportStrategy = 'replace' | 'merge';

// ---------------------------------------------------------------------------
// Scoped export (Req 9.1, 9.5)
// ---------------------------------------------------------------------------
//
// `exportActiveTree` produces a portable `SchemaEnvelopeV1` containing only
// the records associated with the supplied tree id. The `treeId` association
// is stripped from every record so the resulting file matches the original
// portable schema (same shape as v1 backups) and can be re-imported as a
// brand-new tree without leaking the source tree's identifier.
//
// An empty tree exports a valid envelope with empty collections (Req 9.5).
export async function exportActiveTree(treeId: Id): Promise<SchemaEnvelopeV1> {
  const [storedPeople, storedUnions, storedLinks] = await Promise.all([
    getPeopleByTree(treeId),
    getUnionsByTree(treeId),
    getParentChildLinksByTree(treeId),
  ]);

  // Strip `treeId` from each record so the exported envelope matches the
  // portable v1 shape (PersonV1/UnionV1/ParentChildV1 carry no treeId).
  const people: PersonV1[] = storedPeople.map(({ treeId: _t, ...rest }) => rest);
  const unions: UnionV1[] = storedUnions.map(({ treeId: _t, ...rest }) => rest);
  const parentChildLinks: ParentChildV1[] = storedLinks.map(
    ({ treeId: _t, ...rest }) => rest,
  );

  return { version: 1, people, unions, parentChildLinks };
}

// ---------------------------------------------------------------------------
// Schema validation (kept as-is; reused by import-as-new-tree)
// ---------------------------------------------------------------------------

export function isSchemaEnvelopeV1(value: unknown): value is SchemaEnvelopeV1 {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<SchemaEnvelopeV1> & { version?: unknown };
  if (v.version !== 1) return false;
  if (!Array.isArray(v.people) || !Array.isArray(v.unions) || !Array.isArray(v.parentChildLinks)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Legacy single-tree export/import — DEPRECATED
// ---------------------------------------------------------------------------
//
// These were the original whole-database export/import helpers from before
// multi-tree support landed. They are superseded by:
//   - `exportActiveTree(treeId)` for export/backup (this file)
//   - `useActiveTreeStore.importAsNewTree(envelope, name, fileName?)` for
//     import (in `src/lib/activeTreeStore.ts`)
//
// They remain only because `src/app/data/page.tsx` still references them
// pending task 11.2's rewrite of the Data page. Removing them now would
// break the Data page build. Once task 11.2 lands and the Data page is
// migrated to the new flow, both functions (and `ImportStrategy`) should be
// deleted outright.

/**
 * @deprecated Use `exportActiveTree(treeId)` instead. This whole-database
 * exporter is preserved only for the legacy Data page wiring and will be
 * removed once task 11.2 migrates the Data page to the scoped export.
 */
export async function exportData(): Promise<SchemaEnvelopeV1> {
  const [people, unions, parentChildLinks] = await Promise.all([
    db.people.toArray(),
    db.unions.toArray(),
    db.parentChildLinks.toArray(),
  ]);
  return { version: 1, people, unions, parentChildLinks };
}

/**
 * @deprecated Use `useActiveTreeStore.importAsNewTree(envelope, name, fileName?)`
 * instead. This whole-database importer (replace/merge) is preserved only for
 * the legacy Data page wiring and will be removed once task 11.2 migrates the
 * Data page to import-as-new-tree.
 */
export async function importData(envelope: SchemaEnvelopeV1, strategy: ImportStrategy = 'replace'): Promise<{ people: number; unions: number; parentChildLinks: number }> {
  if (envelope.version !== 1) {
    throw new Error('Unsupported version');
  }

  // TODO(task 11.2): remove this helper once the Data page no longer
  // references it. Until then, stamp a `treeId: ''` placeholder on imported
  // records so the v2 table types compile; the real treeId is assigned by
  // `importAsNewTree` once that flow is wired into the Data page.
  const peopleStamped: StoredPerson[] = (envelope.people ?? []).map((p) => ({ ...p, treeId: '' }));
  const unionsStamped: StoredUnion[] = (envelope.unions ?? []).map((u) => ({ ...u, treeId: '' }));
  const linksStamped: StoredParentChild[] = (envelope.parentChildLinks ?? []).map((l) => ({ ...l, treeId: '' }));

  if (strategy === 'replace') {
    await db.transaction('rw', db.people, db.unions, db.parentChildLinks, async () => {
      await Promise.all([db.people.clear(), db.unions.clear(), db.parentChildLinks.clear()]);
      if (peopleStamped.length) await db.people.bulkAdd(peopleStamped);
      if (unionsStamped.length) await db.unions.bulkAdd(unionsStamped);
      if (linksStamped.length) await db.parentChildLinks.bulkAdd(linksStamped);
    });
  } else {
    // merge: upsert by id
    await db.transaction('rw', db.people, db.unions, db.parentChildLinks, async () => {
      if (peopleStamped.length) await db.people.bulkPut(peopleStamped);
      if (unionsStamped.length) await db.unions.bulkPut(unionsStamped);
      if (linksStamped.length) await db.parentChildLinks.bulkPut(linksStamped);
    });
  }

  return {
    people: envelope.people?.length ?? 0,
    unions: envelope.unions?.length ?? 0,
    parentChildLinks: envelope.parentChildLinks?.length ?? 0,
  };
}
