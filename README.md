# Family Tree

## Goal
I want to make a family tree app, preferably using a single framework like next.js. This is only for hobby project and is not related to my startup. 

Basically I want users to add people, their relations very easily and intuitively. They should be able to export and import the data. They should be able to visualize this is a nice tree and more formats. They should also be able to export in image or pdf formats so that it's shareable on social media. 

## Current Status
- App shell with navbar and routes (`/people`, `/tree`) added. Navbar uses shadcn `NavigationMenu`.
- Theme switcher in navbar using Zustand store and `lucide-react` icons (Sun/Moon). Preference is persisted in `localStorage` and respects system preference on first load.
- Domain model (v1) types defined in `src/lib/domain.ts`.
- Home page links to People and Tree.
- Local DB via Dexie configured in `src/lib/db.ts` (v1 schema: `people`, `unions`, `parentChildLinks`).
- Zustand store for people in `src/lib/store.ts` with optimistic CRUD.
- People page (`/people`) provides add/edit/delete and list UI.
- Relationships page (`/relations`) to create unions and parent→child links.
- Relations state in `src/lib/relationsStore.ts` with optimistic CRUD.
- Tree visualization (Step 7): `/tree` renders a React Flow graph with automatic layout using ELK. The layout automatically determines hierarchical levels based on parent-child relationships and partner connections. Union edges are horizontal, parent-child edges vertical. All connected family members are displayed in a single view.
- Import/Export (Step 8): `/data` page supports exporting JSON v1 and importing with `replace` or `merge` strategies.

## Multiple family trees

The app now supports keeping several independent family trees side by side in the same browser. Each tree has its own people, unions, and parent-child links, and switching between trees swaps out the entire view.

- **Tree switcher** — A switcher in the top bar shows the active tree's name and lets you pick a different tree from a dropdown. The dropdown lists every tree you've created, with the active one highlighted.
- **Create / Rename / Delete** — The same dropdown exposes actions to create a new (empty) tree, rename the active tree, and delete a tree. Deleting a tree removes only that tree's records; other trees are untouched. The app keeps at least one tree around at all times.
- **Export and Import on `/data`** — Export downloads a JSON backup of the active tree only. Import-as-new-tree reads a backup file and loads it into a brand-new tree without touching any existing tree, then switches to the newly created tree.

All data lives in your browser's IndexedDB. There is no backend and nothing is uploaded anywhere — clearing site data or switching browsers will leave the trees behind.

See the step-by-step plan in `plan.md`.
