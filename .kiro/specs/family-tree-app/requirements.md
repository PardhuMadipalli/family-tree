# Requirements Document

## Introduction

This document covers the remaining work to complete the Family Tree web application. The app is built with Next.js and already has a working foundation: people management, relationship management, tree visualization with React Flow + ELK, and JSON import/export. The remaining features are media export (SVG/PNG/PDF), persistence safety controls, automated testing, Vercel deployment, and post-MVP enhancements.

## Glossary

- **App**: The Family Tree Next.js web application running in the browser.
- **Tree_View**: The React Flow canvas at `/tree` that renders the family tree graph.
- **Export_Service**: The client-side module responsible for converting the tree to image or PDF formats.
- **Data_Page**: The `/data` route providing import, export, backup, and restore controls.
- **Backup**: A JSON file exported from the App containing the full `SchemaEnvelopeV1` payload.
- **Restore**: The act of importing a Backup file to replace all current app data.
- **DB**: The IndexedDB database managed by Dexie, containing `people`, `unions`, and `parentChildLinks` tables.
- **Store**: The Zustand in-memory state stores (`usePeopleStore`, `useRelationsStore`).
- **SchemaEnvelopeV1**: The versioned JSON structure `{ version: 1, people, unions, parentChildLinks }` used for import/export.
- **Test_Suite**: The collection of unit and integration tests for the App.
- **CI**: The GitHub Actions continuous integration pipeline.

---

## Requirements

### Requirement 1: SVG Export

**User Story:** As a user, I want to export the family tree as an SVG file, so that I can use it in vector editing tools or embed it in documents.

#### Acceptance Criteria

1. WHEN the user clicks the "Export SVG" button on the Tree_View page, THE Export_Service SHALL serialize the current React Flow canvas to a valid SVG file and trigger a browser download.
2. WHEN the SVG is generated, THE Export_Service SHALL include all visible person nodes, union nodes, and edges present in the current viewport layout.
3. IF the Tree_View contains no nodes, THEN THE Export_Service SHALL display an error message indicating there is nothing to export.

---

### Requirement 2: PNG Export

**User Story:** As a user, I want to export the family tree as a PNG image, so that I can share it on social media or messaging apps.

#### Acceptance Criteria

1. WHEN the user clicks the "Export PNG" button on the Tree_View page, THE Export_Service SHALL convert the SVG representation of the tree to a PNG image and trigger a browser download.
2. WHEN generating the PNG, THE Export_Service SHALL render the image at a minimum resolution of 2× the screen pixel density to ensure legibility on high-DPI displays.
3. IF the PNG conversion fails, THEN THE Export_Service SHALL display a descriptive error message to the user.

---

### Requirement 3: PDF Export

**User Story:** As a user, I want to export the family tree as a PDF, so that I can print it or share it as a document.

#### Acceptance Criteria

1. WHEN the user clicks the "Export PDF" button on the Tree_View page, THE Export_Service SHALL generate a PDF document containing the tree image and trigger a browser download.
2. WHEN generating the PDF, THE Export_Service SHALL fit the tree to a standard page size (A4 or Letter) in landscape orientation.
3. IF the PDF generation fails, THEN THE Export_Service SHALL display a descriptive error message to the user.

---

### Requirement 4: Backup Controls

**User Story:** As a user, I want to create a backup of my family tree data, so that I can safeguard against accidental data loss.

#### Acceptance Criteria

1. WHEN the user clicks the "Backup" button on the Data_Page, THE App SHALL export the full DB contents as a `SchemaEnvelopeV1` JSON file and trigger a browser download with a filename containing the current date and time.
2. THE Data_Page SHALL display the timestamp of the most recent successful backup.
3. THE Data_Page SHALL display the current DB size in human-readable units (e.g., KB or MB).

---

### Requirement 5: Restore Controls

**User Story:** As a user, I want to restore my family tree data from a backup file, so that I can recover from data loss or move data between devices.

#### Acceptance Criteria

1. WHEN the user selects a JSON file via the "Restore" control on the Data_Page, THE App SHALL validate the file against the `SchemaEnvelopeV1` schema before applying it.
2. IF the selected file fails schema validation, THEN THE App SHALL display a descriptive error message and leave the existing DB data unchanged.
3. WHEN the user confirms the restore action, THE App SHALL replace all existing DB data with the contents of the backup file and reload the Store.
4. WHEN a restore is initiated, THE App SHALL display a confirmation dialog warning the user that all current data will be replaced before proceeding.

---

### Requirement 6: Reset App Data

**User Story:** As a user, I want to reset all app data, so that I can start fresh without reinstalling or clearing the browser manually.

#### Acceptance Criteria

1. WHEN the user clicks the "Reset App Data" button on the Data_Page, THE App SHALL display a two-step confirmation dialog requiring explicit acknowledgement before deleting any data.
2. WHEN the user confirms the reset, THE App SHALL delete all records from the `people`, `unions`, and `parentChildLinks` tables and clear the Store state.
3. WHEN the reset completes, THE App SHALL display a success notification and navigate the user to the home page.

---

### Requirement 7: Unit Tests — Store Actions

**User Story:** As a developer, I want unit tests for the Zustand store actions, so that I can confidently refactor state logic without regressions.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests that verify `addPerson`, `updatePerson`, and `deletePerson` actions in `usePeopleStore` produce the correct in-memory state.
2. THE Test_Suite SHALL include unit tests that verify `addUnion`, `deleteUnion`, `addParentChildLink`, and `deleteParentChildLink` actions in `useRelationsStore` produce the correct in-memory state.
3. WHEN a store action throws a DB error, THE Test_Suite SHALL verify that the Store rolls back to the previous state.

---

### Requirement 8: Unit Tests — ELK Layout

**User Story:** As a developer, I want unit tests for the ELK layout function, so that I can verify the tree positioning logic is correct.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests that verify the layout function produces non-overlapping node positions for a family graph with at least three generations.
2. THE Test_Suite SHALL include unit tests that verify the layout function handles an empty graph without throwing an error.
3. THE Test_Suite SHALL include unit tests that verify adding a new person to an existing layout produces a valid updated layout.

---

### Requirement 9: Unit Tests — Import/Export Round-Trip

**User Story:** As a developer, I want round-trip tests for the import/export logic, so that I can ensure no data is lost or corrupted during serialization.

#### Acceptance Criteria

1. THE Test_Suite SHALL include a round-trip property test: FOR ALL valid `SchemaEnvelopeV1` objects, serializing to JSON and then parsing SHALL produce an equivalent object.
2. THE Test_Suite SHALL include unit tests that verify importing a previously exported JSON file recreates the same `people`, `unions`, and `parentChildLinks` records.
3. IF an import file contains an unrecognized `version` value, THEN THE Test_Suite SHALL verify that the import function returns a descriptive error and does not modify the DB.

---

### Requirement 10: Integration Tests — People and Relationships Flows

**User Story:** As a developer, I want integration tests for the core user flows, so that I can catch regressions in the UI and data layer together.

#### Acceptance Criteria

1. THE Test_Suite SHALL include an integration test that verifies a user can add a person, see the person in the people list, edit the person's details, and delete the person.
2. THE Test_Suite SHALL include an integration test that verifies a user can create a union between two people and then create a parent-child link, and that the tree visualization reflects both relationships.
3. THE Test_Suite SHALL include an integration test that verifies the export and import flow: exporting data, clearing the DB, and importing the exported file restores the original data.

---

### Requirement 11: CI Pipeline

**User Story:** As a developer, I want a CI pipeline that runs tests and linting on every pull request, so that I can catch issues before merging.

#### Acceptance Criteria

1. THE CI SHALL run all unit tests and integration tests on every pull request targeting the main branch.
2. THE CI SHALL run ESLint on every pull request and fail the build if any lint errors are present.
3. THE CI SHALL run the TypeScript compiler in type-check mode on every pull request and fail the build if any type errors are present.
4. IF any CI check fails, THEN THE CI SHALL report the failure with a descriptive summary in the pull request status.

---

### Requirement 12: Vercel Deployment

**User Story:** As a user, I want the app deployed to a public URL, so that I can access it from any device without running it locally.

#### Acceptance Criteria

1. THE App SHALL build successfully with `next build` without any errors or warnings that would prevent deployment.
2. WHEN deployed to Vercel, THE App SHALL be accessible at a public HTTPS URL.
3. WHEN accessed on a different device from the one used to enter data, THE App SHALL start with an empty DB, reflecting the local-first architecture.
4. THE App SHALL serve all pages with correct caching headers appropriate for a static-first Next.js deployment.
