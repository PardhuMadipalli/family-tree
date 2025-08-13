import Dexie, { Table } from 'dexie';
import type { Id, ParentChildV1, PersonV1, UnionV1 } from './domain';

export class FamilyTreeDB extends Dexie {
  people!: Table<PersonV1, Id>;
  unions!: Table<UnionV1, Id>;
  parentChildLinks!: Table<ParentChildV1, Id>;

  constructor() {
    super('family-tree-db');

    this.version(1).stores({
      people: 'id, givenName, familyName, createdAt, updatedAt',
      unions: 'id, createdAt, updatedAt',
      parentChildLinks: 'id, childId',
    });
  }
}

export const db = new FamilyTreeDB();

// People CRUD
export async function getAllPeople(): Promise<PersonV1[]> {
  return db.people.orderBy('givenName').toArray();
}

export async function addPerson(person: PersonV1): Promise<void> {
  await db.people.add(person);
}

export async function updatePerson(personId: Id, updates: Partial<PersonV1>): Promise<void> {
  await db.people.update(personId, updates);
}

export async function deletePerson(personId: Id): Promise<void> {
  await db.people.delete(personId);
}

// Unions CRUD (scaffold for later steps)
export async function getAllUnions(): Promise<UnionV1[]> {
  return db.unions.toArray();
}

export async function addUnion(union: UnionV1): Promise<void> {
  await db.unions.add(union);
}

export async function updateUnion(unionId: Id, updates: Partial<UnionV1>): Promise<void> {
  await db.unions.update(unionId, updates);
}

export async function deleteUnion(unionId: Id): Promise<void> {
  await db.unions.delete(unionId);
}

// Parent-Child Links CRUD (scaffold for later)
export async function getAllParentChildLinks(): Promise<ParentChildV1[]> {
  return db.parentChildLinks.toArray();
}

export async function addParentChildLink(link: ParentChildV1): Promise<void> {
  await db.parentChildLinks.add(link);
}

export async function deleteParentChildLink(linkId: Id): Promise<void> {
  await db.parentChildLinks.delete(linkId);
}


