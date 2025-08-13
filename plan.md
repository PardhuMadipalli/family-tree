## Project Plan: Family Tree (Next.js)

This plan is organized as small, incremental steps you can ask me to execute one-by-one. Each step has a definition of done, deliverables, and notes. We will prioritize local-first, offline-capable features using IndexedDB via Dexie, state via Zustand, and SVG-based visualization for high-quality export.

### Guiding principles
- **Local-first**: All data stored in the browser (IndexedDB) initially; optional sync later.
- **Typed domain model**: Strong TypeScript types and versioned schemas.
- **SVG-first visualization**: Easier export to PNG/PDF and higher fidelity.
- **MVP-first**: Basic relations and tree view before complex cases.
- **No workarounds**: Aim for robust, extensible architecture at each step.

---

### Step 1 — Baseline app sanity and UI shell
**Goal**: Ensure Next.js + Tailwind v4 are wired; create a clean app shell and nav.
**Tasks**:
- Verify dev server runs and Tailwind utilities work in `src/app/globals.css`.
- Add a minimal layout with top navbar and two routes: `People` and `Tree`.
- Add a lightweight design system (buttons, inputs) using Tailwind.
**DoD**:
- Visiting `/` shows a home page with links to `People` and `Tree`.
- Tailwind classes clearly style components.
- No console errors in devtools.

### Step 2 — Domain model (v1)
**Goal**: Define core types and validations for people and relations.
**Model**:
```ts
// Versioned domain types
export type Id = string; // uuid

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

// A union represents a partnered relationship (e.g., marriage/partnership)
export interface UnionV1 {
  id: Id;
  partnerIds: Id[]; // typically 2, but keep flexible
  startDate?: string; // ISO
  endDate?: string;   // ISO
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// Parent-child link connects a union (or single parent) to a child
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
```
**Tasks**:
- Create `src/lib/domain.ts` with the above types.
- Add simple runtime validators (e.g., zod) later; for now, TypeScript + basic checks.
**DoD**:
- Types compile; clear separation between person data and relationship edges.

### Step 3 — Local database with Dexie
**Goal**: Set up IndexedDB schema and CRUD.
**Tasks**:
- Create `src/lib/db.ts` with Dexie database and tables: `people`, `unions`, `parentChildLinks`, `meta`.
- Add schema version = 1; include basic indexes for efficient lookups.
- Implement CRUD helpers (get/add/update/remove) per table.
**DoD**:
- In devtools Application tab, DB and tables are present.
- CRUD helpers work via a simple test script/page.

### Step 4 — State management via Zustand
**Goal**: Centralize app state and actions that wrap Dexie operations.
**Tasks**:
- Create `src/lib/store.ts` with a strongly-typed Zustand store.
- Store exposes: `people`, `unions`, `parentChildLinks`, selectors, and actions.
- Actions write to Dexie and then update in-memory state.
- Add optimistic updates with rollback protection for write failures.
**DoD**:
- Simple page demonstrates adding/updating/removing a person and seeing list update reactively.

### Step 5 — People management UI
**Goal**: Create CRUD UI for people.
**Tasks**:
- `src/app/people/page.tsx`: List with search, add button.
- Modal or page for Create/Edit person with basic validation.
- Soft delete (flag) or hard delete (MVP can hard delete) with confirm.
**DoD**:
- I can add, edit, delete people and see changes persisted across reloads.

### Step 6 — Relationship management UI
**Goal**: Define unions (partnerships) and parent-child links.
**Tasks**:
- Simple UI to pick two people and create a union.
- UI to link parent(s) → child.
- Derived views: siblings via shared parent(s), spouses via union partners.
**DoD**:
- I can create partnerships and parent-child links; summaries visible in each person’s detail view.

### Step 7 — Tree visualization (v1)
**Goal**: Render an SVG tree for a selected root person.
**Tasks**:
- Use reactflow to get a nice tree visualization.
- Implement a layout function (start with `d3-hierarchy` or a simple custom DFS level layout) to compute positions from `parentChildLinks`.
- Render nodes and links using SVG; add pan/zoom (via pointer events or a small helper library).
- Node card shows name and key dates; click selects/focuses person.
- Show different colours for male and female nodes.
- Show edge colours to identify the relationship type.
**DoD**:
- I can choose a root and see an interactive, pannable tree with readable labels.

### Step 8 — Import/Export (JSON v1)
**Goal**: Lossless import/export of the domain data.
**Tasks**:
- Define a JSON schema envelope with `version: 1` matching domain.
- Add `Export` button to download JSON.
- Add `Import` button to upload JSON with validation and optional merge/replace strategy.
**DoD**:
- Exported JSON re-imports into a fresh profile to recreate the same data.

### Step 9 — Media export (SVG/PNG/PDF)
**Goal**: Enable one-click export of the current tree view as image/PDF.
**Tasks**:
- Ensure the tree is rendered as SVG.
- Implement SVG to PNG export using an offscreen canvas.
- Implement SVG to PDF via `svg2pdf.js` + `jspdf` (client-side) or produce a high-DPI PNG embedded in a PDF.
**DoD**:
- PNG and PDF exports match on-screen rendering at reasonable quality.

### Step 10 — Persistence UX and safety
**Goal**: Prevent data loss and give control.
**Tasks**:
- Add `Backup`/`Restore` controls that wrap JSON export/import.
- Add a `Reset app data` option with double-confirm.
- Show last backup time and DB size.
**DoD**:
- Clear backup/restore flows and confirmations are present.

### Step 11 — Testing and quality
**Goal**: Basic coverage for core logic.
**Tasks**:
- Add unit tests for layout function, store actions, and import/export.
- Add a few integration tests for people and relationships flows (Playwright or Cypress). 
**DoD**:
- CI (GitHub Actions) runs tests and lints on PRs.

### Step 12 — Deployment
**Goal**: Deploy to Vercel.
**Tasks**:
- Add production build settings; verify static caching strategy.
- Configure Vercel project and environment.
- Smoke test on production URL.
**DoD**:
- Public URL is shareable and works across devices.

### Step 13 — Enhancements (post-MVP)
Potential follow-ups:
- GEDCOM import/export.
- More relationship types (adoption, step-parents, guardians).
- Advanced layouts (ELK or Dagre), generations collapsing, multi-root views.
- Cloud sync, auth, and sharing.
- Theming and dark mode; accessibility audits.

---

## How to use this plan with the assistant
- Ask: “Execute Step 1” (or any step). I will implement it completely, run checks, and report back.
- If you want changes, say: “Revise Step X to include Y,” and I’ll update `plan.md` and proceed.


