import { db } from './db';
import type { SchemaEnvelopeV1, PersonV1, UnionV1, ParentChildV1 } from './domain';

export type ImportStrategy = 'replace' | 'merge';

export async function exportData(): Promise<SchemaEnvelopeV1> {
  const [people, unions, parentChildLinks] = await Promise.all([
    db.people.toArray(),
    db.unions.toArray(),
    db.parentChildLinks.toArray(),
  ]);
  return { version: 1, people, unions, parentChildLinks };
}

export function isSchemaEnvelopeV1(value: unknown): value is SchemaEnvelopeV1 {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<SchemaEnvelopeV1> & { version?: unknown };
  if (v.version !== 1) return false;
  if (!Array.isArray(v.people) || !Array.isArray(v.unions) || !Array.isArray(v.parentChildLinks)) return false;
  return true;
}

export async function importData(envelope: SchemaEnvelopeV1, strategy: ImportStrategy = 'replace'): Promise<{ people: number; unions: number; parentChildLinks: number }> {
  if (envelope.version !== 1) {
    throw new Error('Unsupported version');
  }

  if (strategy === 'replace') {
    await db.transaction('rw', db.people, db.unions, db.parentChildLinks, async () => {
      await Promise.all([db.people.clear(), db.unions.clear(), db.parentChildLinks.clear()]);
      if (envelope.people?.length) await db.people.bulkAdd(envelope.people as PersonV1[]);
      if (envelope.unions?.length) await db.unions.bulkAdd(envelope.unions as UnionV1[]);
      if (envelope.parentChildLinks?.length) await db.parentChildLinks.bulkAdd(envelope.parentChildLinks as ParentChildV1[]);
    });
  } else {
    // merge: upsert by id
    await db.transaction('rw', db.people, db.unions, db.parentChildLinks, async () => {
      if (envelope.people?.length) await db.people.bulkPut(envelope.people as PersonV1[]);
      if (envelope.unions?.length) await db.unions.bulkPut(envelope.unions as UnionV1[]);
      if (envelope.parentChildLinks?.length) await db.parentChildLinks.bulkPut(envelope.parentChildLinks as ParentChildV1[]);
    });
  }

  return {
    people: envelope.people?.length ?? 0,
    unions: envelope.unions?.length ?? 0,
    parentChildLinks: envelope.parentChildLinks?.length ?? 0,
  };
}
