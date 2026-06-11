# Requirements Document

## Introduction

This feature extends the Family Tree web application from managing a single family tree to managing multiple independent family trees within one browser. Today the app stores all people, unions, and parent-child links in shared IndexedDB tables with no notion of which tree they belong to. This feature introduces the concept of named trees, each with its own isolated set of records, an active-tree selection that persists across sessions, a tree switcher in the top bar, lifecycle controls (create, rename, delete), and an import flow that loads a backup file as a brand-new tree without altering any existing tree.

The app remains local-first: all data lives in the browser's IndexedDB, there is no backend, and no data leaves the device.

## Glossary

- **App**: The Family Tree Next.js web application running in the browser.
- **Tree**: A named, self-contained family tree dataset consisting of its own people, unions, and parent-child links. Each Tree has a unique identifier and a display name.
- **Tree_Record**: Any persisted people, union, or parent-child-link entity that belongs to exactly one Tree.
- **Tree_Registry**: The persisted collection of all Trees and their metadata (identifier, name, creation time).
- **Active_Tree**: The single Tree currently selected for viewing and editing. All people, relations, and tree-visualization pages operate on the Active_Tree.
- **Tree_Switcher**: The control rendered in the App's top bar that displays the Active_Tree name and lets the user select a different Tree.
- **Top_Bar**: The persistent navigation header rendered across App pages.
- **Data_Page**: The `/data` route providing import, export, backup, and restore controls.
- **Import_Service**: The client-side module that reads a backup file and loads it into the App.
- **DB**: The IndexedDB database managed by Dexie that persists Trees and Tree_Records.
- **Store**: The Zustand in-memory state stores (`usePeopleStore`, `useRelationsStore`) holding the Active_Tree records.
- **SchemaEnvelopeV1**: The versioned JSON structure `{ version: 1, people, unions, parentChildLinks }` used for import, export, and backup.
- **Default_Tree**: The Tree into which pre-existing single-tree data is migrated when the feature is first activated.
- **Active_Tree_Pointer**: The persisted reference identifying which Tree is the Active_Tree.

---

## Requirements

### Requirement 1: Multiple Tree Storage and Isolation

**User Story:** As a user, I want each family tree to keep its own people and relationships separate, so that data from one tree never appears in or affects another.

#### Acceptance Criteria

1. THE DB SHALL persist a Tree_Registry containing zero or more Trees, where each Tree has an identifier that is unique across all Trees in the Tree_Registry, a display name of 1 to 100 characters, and a creation timestamp recording the date and time the Tree was created.
2. THE DB SHALL associate every Tree_Record with exactly one Tree identifier that exists in the Tree_Registry.
3. WHEN the App loads people, unions, and parent-child links into the Store, THE App SHALL include only Tree_Records whose associated Tree identifier equals the Active_Tree identifier, and SHALL exclude all Tree_Records associated with any other Tree.
4. WHEN the user creates, updates, or deletes a Tree_Record, THE App SHALL associate the change with the Active_Tree and SHALL leave Tree_Records of all other Trees unchanged.
5. IF the App loads Tree_Records into the Store while no Active_Tree is set, THEN THE App SHALL load zero Tree_Records into the Store and SHALL present an indication that no Tree is selected.
6. IF the Active_Tree identifier does not match any Tree in the Tree_Registry when the App loads Tree_Records, THEN THE App SHALL load zero Tree_Records into the Store and SHALL present an error indication that the selected Tree is unavailable.
7. WHEN the user deletes a Tree from the Tree_Registry, THE App SHALL delete all Tree_Records associated with that Tree's identifier and SHALL leave Tree_Records of all other Trees unchanged.

---

### Requirement 2: Active Tree Selection and Persistence

**User Story:** As a user, I want the app to remember which tree I was working on, so that I return to the same tree after reloading or reopening the app.

#### Acceptance Criteria

1. WHILE at least one Tree exists in the Tree_Registry, THE App SHALL maintain exactly one Active_Tree.
2. WHEN the Active_Tree changes, THE App SHALL persist the Active_Tree_Pointer in the browser within 1 second so that the selection survives page reloads and browser restarts.
3. WHEN the user selects a different existing Tree, THE App SHALL set that Tree as the Active_Tree.
4. WHEN the App starts and a persisted Active_Tree_Pointer references an existing Tree, THE App SHALL set that Tree as the Active_Tree within 3 seconds of app start.
5. IF the App starts and the persisted Active_Tree_Pointer references a Tree that no longer exists, THEN THE App SHALL set the Tree with the most recent creation timestamp as the Active_Tree.
6. IF the App starts and no Tree exists in the Tree_Registry, THEN THE App SHALL create one Tree named "My Family Tree" and set it as the Active_Tree.
7. IF persisting the Active_Tree_Pointer fails, THEN THE App SHALL retain the current Active_Tree for the session and present an error indication that the selection could not be saved.

---

### Requirement 3: Tree Switcher in the Top Bar

**User Story:** As a user, I want a tree selector in the top bar, so that I can switch between my family trees from anywhere in the app.

#### Acceptance Criteria

1. THE Top_Bar SHALL display the Tree_Switcher showing the name of the Active_Tree, truncating the displayed name beyond 40 characters.
2. WHEN the user opens the Tree_Switcher, THE Tree_Switcher SHALL list the names of all Trees in the Tree_Registry ordered by creation timestamp with the most recently created Tree first.
3. WHEN the user selects a Tree from the Tree_Switcher that is not the Active_Tree, THE App SHALL set the selected Tree as the Active_Tree and reload the Store with that Tree's records within 2 seconds.
4. WHEN the Active_Tree changes, THE App SHALL display only the records of the new Active_Tree on the people, relations, and tree-visualization pages, with no records of the previous Active_Tree remaining visible.
5. WHILE only one Tree exists in the Tree_Registry, THE Tree_Switcher SHALL display that Tree as the Active_Tree.
6. THE Tree_Switcher SHALL visually indicate which Tree in the list is the Active_Tree.
7. WHEN the user selects the Tree that is already the Active_Tree, THE App SHALL leave the Active_Tree and the Store unchanged.
8. IF reloading the Store fails while switching to a selected Tree, THEN THE App SHALL retain the previous Active_Tree and present an error indication that the Tree could not be loaded.

---

### Requirement 4: Create Tree

**User Story:** As a user, I want to create a new empty family tree, so that I can start documenting a separate family.

#### Acceptance Criteria

1. WHEN the user invokes the create-tree action with a name that, after removing leading and trailing whitespace, contains between 1 and 100 characters inclusive, THE App SHALL add a new Tree to the Tree_Registry using the trimmed name and an empty set of Tree_Records.
2. WHEN a new Tree is added to the Tree_Registry, THE App SHALL set the new Tree as the Active_Tree.
3. WHEN a new Tree is added to the Tree_Registry, THE App SHALL allow the trimmed name to duplicate the name of an existing Tree without rejecting the action.
4. IF the user invokes the create-tree action with a name that, after removing leading and trailing whitespace, contains zero characters, THEN THE App SHALL reject the action, leave the Tree_Registry and Active_Tree unchanged, and display a message indicating that a tree name is required.
5. IF the user invokes the create-tree action with a name that, after removing leading and trailing whitespace, contains more than 100 characters, THEN THE App SHALL reject the action, leave the Tree_Registry and Active_Tree unchanged, and display a message indicating that the tree name exceeds the maximum allowed length.

---

### Requirement 5: Rename Tree

**User Story:** As a user, I want to rename a family tree, so that I can correct or update its label.

#### Acceptance Criteria

1. WHEN the user invokes the rename action for a Tree with a name that, after removing leading and trailing whitespace, contains between 1 and 100 characters inclusive, THE App SHALL update that Tree's display name to the trimmed name and persist the change to the Tree_Registry.
2. WHEN a Tree is renamed, THE App SHALL display the updated name in the Tree_Switcher.
3. IF the user invokes the rename action with a name that, after removing leading and trailing whitespace, contains zero characters, THEN THE App SHALL reject the action, leave the Tree's existing name unchanged, and display a message indicating that a tree name is required.
4. IF the user invokes the rename action with a name that, after removing leading and trailing whitespace, contains more than 100 characters, THEN THE App SHALL reject the action, leave the Tree's existing name unchanged, and display a message indicating that the tree name exceeds the maximum allowed length.
5. WHEN a Tree is renamed, THE App SHALL leave the Tree_Records of that Tree and all other Trees unchanged.

---

### Requirement 6: Delete Tree

**User Story:** As a user, I want to delete a family tree, so that I can remove data I no longer need.

#### Acceptance Criteria

1. WHEN the user invokes the delete action for a Tree, THE App SHALL display a confirmation dialog that names the Tree, states that the Tree and all of its Tree_Records will be permanently removed, and presents explicit confirm and cancel controls.
2. WHEN the user confirms the delete action, THE App SHALL atomically remove the selected Tree from the Tree_Registry and delete all Tree_Records associated with that Tree.
3. WHEN the user confirms deletion of the Active_Tree and at least one other Tree exists, THE App SHALL set the remaining Tree with the most recent creation timestamp as the Active_Tree and reload the Store with that Tree's records.
4. WHEN the user confirms deletion of the only remaining Tree, THE App SHALL create one Tree named "My Family Tree", set it as the Active_Tree, and reload the Store with that Tree's records.
5. WHEN the user confirms deletion of a Tree that is not the Active_Tree, THE App SHALL leave the Active_Tree and its Tree_Records unchanged.
6. WHEN the user cancels or dismisses the confirmation dialog, THE App SHALL leave the Tree_Registry, all Tree_Records, and the Active_Tree unchanged.
7. IF deletion fails to complete, THEN THE App SHALL retain the selected Tree and its Tree_Records, leave the Active_Tree unchanged, and present an error indication that the Tree could not be deleted.

---

### Requirement 7: Import as New Tree

**User Story:** As a user, I want to import a backup file as a new tree, so that I can load another family's data without overwriting or merging into the tree I am currently working on.

#### Acceptance Criteria

1. WHEN the user selects a backup file via the import-as-new-tree control on the Data_Page, THE Import_Service SHALL validate the file against the SchemaEnvelopeV1 schema before creating any Tree or modifying any Tree_Record.
2. IF the selected file cannot be read or cannot be parsed as JSON, THEN THE Import_Service SHALL reject the import, display an error message indicating that the file could not be read, and leave the Tree_Registry and all Tree_Records unchanged.
3. IF the selected file fails SchemaEnvelopeV1 validation, THEN THE Import_Service SHALL reject the import, display an error message indicating that the file failed SchemaEnvelopeV1 validation, and leave the Tree_Registry and all Tree_Records unchanged.
4. WHEN the user confirms an import of a valid backup file, THE App SHALL add a new Tree to the Tree_Registry and associate every person, union, and parent-child link from the file with the new Tree's identifier.
5. WHEN the App imports a valid backup file as a new Tree, THE App SHALL leave the Tree_Records and Tree_Registry entries of all previously existing Trees unchanged.
6. WHEN the import-as-new-tree action completes successfully, THE App SHALL set the newly created Tree as the Active_Tree and reload the Store with only the imported records.
7. WHERE the user provides a tree name containing at least one non-whitespace character, THE App SHALL assign that name to the new Tree.
8. IF the user provides no tree name or a name containing only whitespace, THEN THE App SHALL assign a default name derived from the source file name when the file name is available, and otherwise derived from the current date.

---

### Requirement 8: Migration of Existing Single-Tree Data

**User Story:** As an existing user, I want my current family tree data to be preserved when multi-tree support is added, so that I do not lose any people or relationships.

#### Acceptance Criteria

1. WHEN the App starts and finds existing Tree_Records that are not associated with any Tree and no migration-completed indicator exists, THE App SHALL atomically create a Default_Tree named "My Family Tree" and associate all such Tree_Records with the Default_Tree.
2. WHEN the migration completes successfully, THE App SHALL set the Default_Tree as the Active_Tree and persist a migration-completed indicator.
3. WHEN the migration runs, THE App SHALL modify only the Tree-association attribute of each existing person, union, and parent-child link, preserving all of their other field values.
4. WHEN the migration runs, THE App SHALL neither add nor delete any person, union, or parent-child link.
5. WHEN the App starts and a migration-completed indicator exists, THE App SHALL start without creating an additional Default_Tree or duplicating Tree_Records.
6. IF the migration fails to complete, THEN THE App SHALL leave the existing Tree_Records unassociated, create no Default_Tree, persist no migration-completed indicator, and present an error indication that the data could not be migrated.

---

### Requirement 9: Export and Backup Scoped to the Active Tree

**User Story:** As a user, I want export and backup to act on the tree I am currently viewing, so that I get a file containing only that family's data.

#### Acceptance Criteria

1. WHEN the user triggers an export or backup on the Data_Page, THE App SHALL produce a SchemaEnvelopeV1 file whose people, unions, and parent-child links are exactly the Tree_Records associated with the Active_Tree and SHALL exclude every Tree_Record associated with any other Tree.
2. WHILE the Data_Page is displayed, THE App SHALL display the name of the Active_Tree on which the export and backup actions will operate.
3. WHEN the user exports the Active_Tree and then imports the resulting file as a new Tree, THE App SHALL produce a new Tree whose people, unions, and parent-child links correspond one-to-one with those of the originally exported Active_Tree by identifier and by all field values, with no added or missing records.
4. IF an export or backup fails to produce the file, THEN THE App SHALL display an error message indicating the export did not complete and SHALL leave the Tree_Registry and all Tree_Records unchanged.
5. WHEN the user triggers an export or backup while the Active_Tree contains zero Tree_Records, THE App SHALL produce a valid SchemaEnvelopeV1 file containing empty people, unions, and parent-child-link collections.
