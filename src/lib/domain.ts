export type Id = string;

export interface PersonV1 {
  id: Id;
  givenName: string;
  familyName?: string;
  birthDate?: string; // ISO date
  deathDate?: string; // ISO date
  gender?: 'male' | 'female' | 'other' | 'unknown';
  notes?: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface UnionV1 {
  id: Id;
  partnerIds: Id[]; // typically 2
  startDate?: string; // ISO
  endDate?: string; // ISO
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


