---
inclusion: auto
---

# UI Design Conventions

This file documents the established UI patterns and design conventions for the Family Tree app. Follow these when building new pages or modifying existing ones.

## Layout Structure

- All pages use a shared layout in `src/app/layout.tsx` with a max-width of `max-w-6xl` and `px-4` padding.
- The layout includes a sticky header with navigation, a `<main>` content area, and a footer.
- The footer reads: "Family Tree · Data stored locally in your browser" and uses `text-xs text-black/40 dark:text-white/30`.
- The footer has a top border `border-t border-black/5 dark:border-white/5` and `mt-12` margin.

## Navigation

- Navigation uses shadcn `NavigationMenu` with four links: People, Tree, Relationships, Data.
- The active page link gets `font-medium border-b-2 border-current pb-0.5` styling for a visible underline indicator.
- The `data-active` attribute is set based on `usePathname()` comparison.
- A theme toggle button (Sun/Moon icon) sits to the right of the nav links.

## Page Headings

- Page headings use `text-xl font-semibold` (`<h2>`) for section pages.
- The home page uses `text-2xl font-semibold` (`<h1>`).
- When a page has a toolbar (e.g., export buttons), the heading and toolbar share the same row using `flex items-center justify-between`.

## Stats Display

- Summary stats (people count, unions count, links count) use inline icon + text badges.
- Icons: `Users` for people, `GitBranch` for unions, `TreePalm` for links.
- On the home page, stats use bordered pill containers with `rounded-md border border-black/10 dark:border-white/10 px-4 py-3`.
- On the data page, stats use a compact inline format with `text-xs text-muted-foreground` and `size-3` icons.

## Forms

- Form labels use `text-xs text-black/70 dark:text-white/70` via the `CustomLabel` component on the People page.
- Form inputs use `h-9 rounded-md border border-black/15 dark:border-white/15 px-2 bg-transparent`.
- Multi-select fields use the `EnhancedMultiSelect` component which wraps `MultiSelect` with an "Add Person" dialog.
- The `Select` component (shadcn) should include a `name` prop for the hidden native select to avoid browser form-field warnings.
- A visual separator (`<hr className="border-black/5 dark:border-white/5" />`) should separate form sections from data tables.

## Tables

- Data tables use the `DataTable` component from `src/components/data-table.tsx` with `@tanstack/react-table`.
- Action columns contain View (eye icon), Edit (pencil icon), and Delete (trash icon) buttons.
- View and Edit open `Dialog` components; Delete uses `window.confirm` or `AlertDialog`.

## Lists (Relationships Page)

- Relationship lists (unions, parent-child links) use bordered card-style rows: `rounded-md border border-black/5 dark:border-white/5 px-3 py-2 text-sm hover:bg-muted/30 transition`.
- Lists are constrained to `max-w-2xl` to prevent the delete button from floating too far right.
- Section headings include inline count badges: `<span className="text-xs text-muted-foreground">{count} union{count !== 1 ? 's' : ''}</span>`.

## Empty States

- The Tree canvas shows a centered message "Add people and relationships to see your tree here." when no data exists.
- The People table shows "No people yet. Add the first person above." when empty.

## Home Page

- The home page includes: welcome heading, description, stats bar (when data exists), a 3-step "Get Started" card grid, and primary/secondary CTA buttons.
- The "Go to People" button is the primary CTA with `bg-white text-black` styling.
- The "View Tree" button is secondary with a border outline.
- Get-started cards use `rounded-lg border p-4 hover:bg-black/5 dark:hover:bg-white/5 transition` in a `grid grid-cols-3 gap-4 max-w-2xl` layout.

## Data Page

- The import strategy toggle (Replace/Merge) uses adjacent buttons with `rounded-r-none` / `rounded-l-none` for a segmented control look.
- Below the toggle, a helper text explains the selected strategy in `text-xs text-muted-foreground max-w-md`.

## Tree Page

- The tree canvas uses React Flow with ELK layout.
- Export buttons (PNG, PDF) sit in the heading row, right-aligned.
- The React Flow watermark is kept visible (not hidden).
- The canvas container has `rounded-md overflow-hidden border border-black/10 dark:border-white/10 h-[600px]`.

## Dark Mode

- The app supports dark mode via a Zustand theme store (`useThemeStore`).
- Dark mode is toggled by adding/removing the `dark` class on `<html>`.
- Use Tailwind `dark:` variants for all color values. Prefer `black/N` and `white/N` opacity patterns over hardcoded colors.

## Meta / SEO

- The `<head>` includes `<title>Family Tree</title>` and a `<meta name="description">` tag.
- The description reads: "Build and visualize your family tree locally in your browser. Add people, define relationships, and explore your ancestry."
