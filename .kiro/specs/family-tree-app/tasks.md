# Implementation Plan: Family Tree App — Remaining Features

## Overview

Implement media export (SVG/PNG/PDF), persistence safety controls (Backup/Restore/Reset), automated testing infrastructure, and CI/CD pipeline. Each phase builds on the previous, ending with full test coverage and a working CI pipeline.

## Tasks

- [ ] 1. Set up testing infrastructure
  - Install dev dependencies: `vitest`, `@vitejs/plugin-react`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `fake-indexeddb`, `fast-check`, `jsdom`
  - Create `vitest.config.ts` with `environment: 'jsdom'`, `globals: true`, `setupFiles: ['./src/test/setup.ts']`
  - Create `src/test/setup.ts` that configures `fake-indexeddb` for Dexie and imports `@testing-library/jest-dom`
  - Add `"test": "vitest --run"`, `"test:watch": "vitest"`, `"typecheck": "tsc --noEmit"` scripts to `package.json`
  - _Requirements: 7, 8, 9, 10_

- [ ] 2. Add `resetData` and `getDbSizeBytes` to `io.ts`
  - [ ] 2.1 Implement `resetData()` in `src/lib/io.ts`
    - Clear all three Dexie tables (`people`, `unions`, `parentChildLinks`) in a single `db.transaction('rw', ...)` call
    - Export the function
    - _Requirements: 6.2_

  - [ ] 2.2 Implement `getDbSizeBytes()` in `src/lib/io.ts`
    - Call `exportData()`, serialize result with `JSON.stringify`, return `.length`
    - Export the function
    - _Requirements: 4.3_

  - [ ]* 2.3 Write property tests for `resetData` and `getDbSizeBytes`
    - **Property 6: Reset empties all tables**
    - **Validates: Requirements 6.2**
    - **Property 3: DB size formatting produces valid human-readable string**
    - **Validates: Requirements 4.3**

  - [ ]* 2.4 Write property tests for `isSchemaEnvelopeV1` and import/export round-trip
    - **Property 4: Schema validation correctly classifies all inputs**
    - **Validates: Requirements 5.1**
    - **Property 5: Restore round-trip preserves all data**
    - **Validates: Requirements 5.3, 9.1, 9.2**
    - **Property 11: JSON serialization round-trip**
    - **Validates: Requirements 9.1**

- [ ] 3. Create `src/lib/exportService.ts`
  - [ ] 3.1 Implement `ExportError` class and `exportSVG`, `exportPNG`, `exportPDF` functions
    - `ExportError` extends `Error` with a `format: 'svg' | 'png' | 'pdf'` field
    - `exportSVG` uses `html-to-image`'s `toSvg`, filters out `.react-flow__controls` and `.react-flow__minimap`, triggers download as `family-tree.svg`
    - `exportPNG` extracts the existing inline logic from `TreeCanvas.tsx` (2× pixel ratio, same filter), triggers download as `family-tree.png`
    - `exportPDF` extracts the existing inline PDF logic from `TreeCanvas.tsx` (A4 landscape, centered, aspect-ratio-preserving), triggers download as `family-tree.pdf`
    - Each function throws `ExportError` if the element is null or conversion fails
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 3.1, 3.2_

  - [ ]* 3.2 Write property test for PDF layout calculation
    - Extract the PDF dimension calculation into a pure helper `computePdfLayout(imgW, imgH, pageW, pageH)` so it can be tested without a DOM
    - **Property 2: PDF layout fits page bounds**
    - **Validates: Requirements 3.2**

- [ ] 4. Update `TreeCanvas.tsx` to use `exportService`
  - Replace inline `exportPNG` and `exportPDF` functions with calls to `exportService.exportPNG` and `exportService.exportPDF`
  - Add "Export SVG" button alongside the existing PNG/PDF buttons, calling `exportService.exportSVG`
  - Add `errorMessage` state string; wrap each export call in `try/catch (e)` that sets `errorMessage` when `e` is an `ExportError`; render `<p>` below buttons when `errorMessage` is set; clear on next export attempt
  - Guard all three buttons with `disabled={exporting || nodes.length === 0}`
  - _Requirements: 1.1, 1.3, 2.1, 2.3, 3.1, 3.3_

- [ ] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Update `data/page.tsx` with Backup, Restore, and Reset sections
  - [ ] 6.1 Add Backup section
    - "Backup" button calls `exportData()` and downloads `family-tree-backup-{YYYY-MM-DDTHH-mm-ss}.json` (colons replaced with hyphens)
    - On success, write `localStorage.setItem('lastBackupAt', new Date().toISOString())`
    - Display "Last backup: {relative time}" (read from `lastBackupAt`) or "No backup yet" on mount
    - Display current DB size from `getDbSizeBytes()` formatted as KB or MB (1 decimal place)
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ] 6.2 Add Restore section
    - File input accepting `application/json`
    - On file selection: parse JSON → validate with `isSchemaEnvelopeV1` → if invalid show inline error and stop; if valid open confirmation `AlertDialog` warning all current data will be replaced
    - On confirm: call `importData(envelope, 'replace')`, then call `hydrate()` on both `usePeopleStore` and `useRelationsStore`; show success message
    - On DB write failure: catch error, display inline error, leave DB unchanged
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ] 6.3 Add Reset section
    - "Reset App Data" button opens a two-step `AlertDialog`:
      - Step 1: "Are you sure?" with Cancel / Continue buttons
      - Step 2: "This will permanently delete all data. Type RESET to confirm." with a text `<Input>` and a Confirm button disabled until input equals `"RESET"`
    - On confirmed: call `resetData()`, call `hydrate()` on both stores, navigate to `/` with `router.push('/')`
    - On `resetData()` failure: catch error, display inline error, do not navigate
    - _Requirements: 6.1, 6.2, 6.3_

- [ ] 7. Write unit tests for store actions
  - [ ] 7.1 Write unit tests in `src/lib/__tests__/store.test.ts`
    - Example: add a person → store contains that person
    - Example: update a person → store reflects updated fields
    - Example: delete a person → store no longer contains that person
    - Edge case: DB throws on add → store rolls back to previous state
    - _Requirements: 7.1, 7.3_

  - [ ]* 7.2 Write property test for people store CRUD
    - **Property 7: People store CRUD correctness**
    - **Validates: Requirements 7.1**

  - [ ] 7.3 Write unit tests in `src/lib/__tests__/relationsStore.test.ts`
    - Example: add a union → store contains that union
    - Example: delete a union → store no longer contains it
    - Example: add a parent-child link → store contains it
    - Example: delete a parent-child link → store no longer contains it
    - Edge case: DB throws → store rolls back
    - _Requirements: 7.2, 7.3_

  - [ ]* 7.4 Write property test for relations store CRUD
    - **Property 8: Relations store CRUD correctness**
    - **Validates: Requirements 7.2**

  - [ ]* 7.5 Write property test for store rollback on DB error
    - **Property 9: Store rollback on DB error**
    - **Validates: Requirements 7.3**

- [ ] 8. Write unit tests for ELK layout
  - [ ] 8.1 Write unit tests in `src/lib/__tests__/elkLayout.test.ts`
    - Edge case: empty graph (`nodes: [], edges: []`) → resolves without throwing
    - Example: 3-generation graph → all nodes have valid numeric `position.x` and `position.y`
    - _Requirements: 8.1, 8.2_

  - [ ]* 8.2 Write property test for ELK layout non-overlapping positions
    - **Property 10: ELK layout produces non-overlapping positions for any valid graph**
    - **Validates: Requirements 8.1, 8.3**

- [ ] 9. Write unit tests for import/export
  - [ ] 9.1 Write unit tests in `src/lib/__tests__/io.test.ts`
    - Edge case: import with `version: 2` → throws, DB unchanged
    - Edge case: import with missing arrays → `isSchemaEnvelopeV1` returns `false`
    - Example: import a valid envelope → re-export produces equivalent envelope
    - _Requirements: 9.2, 9.3_

- [ ] 10. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Write integration tests
  - [ ] 11.1 Write `src/app/__tests__/people.integration.test.tsx`
    - Render the people page with fake IndexedDB
    - Add a person via the dialog → verify it appears in the table
    - Edit the person's details → verify the update is reflected
    - Delete the person → verify it is gone from the table
    - _Requirements: 10.1_

  - [ ] 11.2 Write `src/app/__tests__/relations.integration.test.tsx`
    - Seed two people, create a union between them, add a parent-child link
    - Verify `useRelationsStore` contains both the union and the parent-child link
    - _Requirements: 10.2_

  - [ ] 11.3 Write `src/app/__tests__/dataFlow.integration.test.tsx`
    - Seed DB, call `exportData()`, clear DB, call `importData(exported, 'replace')`, call `exportData()` again
    - Assert second export deeply equals first export
    - _Requirements: 10.3_

  - [ ]* 11.4 Write property test for integration export/import round-trip
    - **Property 12: Integration export → clear → import restores original data**
    - **Validates: Requirements 10.3**

- [ ] 12. Create CI pipeline
  - Create `.github/workflows/ci.yml` triggered on `pull_request` targeting `main`
  - Steps: `actions/checkout@v4`, `actions/setup-node@v4` (node 20, npm cache), `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npx vitest --run`
  - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [ ] 13. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties; unit tests validate specific examples and edge cases
