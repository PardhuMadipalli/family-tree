"use client";

import { useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveTreeStore } from "@/lib/activeTreeStore";
import { CreateTreeDialog } from "@/components/CreateTreeDialog";
import { RenameTreeDialog } from "@/components/RenameTreeDialog";
import { DeleteTreeDialog } from "@/components/DeleteTreeDialog";

// Sentinel values used by the dropdown's action items so we can intercept
// them in `onValueChange` without ever assigning them as the Select's value
// (the Select stays controlled to `activeTreeId`).
const SENTINEL_CREATE = "__create__";
const SENTINEL_RENAME = "__rename__";
const SENTINEL_DELETE = "__delete__";

/**
 * TreeSwitcher (task 10.1 / Req 3.1, 3.2, 3.5, 3.6, 3.7).
 *
 * shadcn `Select`-based switcher mounted in the top bar:
 *   - The trigger displays the Active_Tree name, truncated past 40 chars
 *     via `max-w-[40ch] truncate` (Req 3.1).
 *   - Options come from `useActiveTreeStore.trees`, which the store
 *     already orders by `createdAt` desc (Req 3.2).
 *   - The active option renders a Check indicator via shadcn's
 *     `SelectItem` (which uses `lucide-react`'s `CheckIcon` in
 *     Radix's `ItemIndicator`) (Req 3.6).
 *   - Selecting the already-active option is a no-op; selecting another
 *     tree calls `useActiveTreeStore.setActiveTree(id)` (Req 3.7, 3.5).
 *   - The bottom of the dropdown contains action items (`New tree…`,
 *     `Rename current tree…`, `Delete current tree…`) that open the
 *     corresponding lifecycle dialogs.
 */
export function TreeSwitcher() {
  const trees = useActiveTreeStore((state) => state.trees);
  const activeTreeId = useActiveTreeStore((state) => state.activeTreeId);
  const setActiveTree = useActiveTreeStore((state) => state.setActiveTree);

  const [showCreate, setShowCreate] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const handleValueChange = (value: string) => {
    // Action items: intercept and open the matching dialog without
    // mutating the Select's controlled value.
    if (value === SENTINEL_CREATE) {
      setShowCreate(true);
      return;
    }
    if (value === SENTINEL_RENAME) {
      setShowRename(true);
      return;
    }
    if (value === SENTINEL_DELETE) {
      setShowDelete(true);
      return;
    }

    // Selecting the already-active option is a no-op (Req 3.7 / Property 10).
    if (value === activeTreeId) {
      return;
    }

    void setActiveTree(value);
  };

  // When no tree is active, rename/delete have no target so they are
  // disabled. Create is always available.
  const lifecycleDisabled = activeTreeId === null;

  return (
    <>
      <Select
        value={activeTreeId ?? undefined}
        onValueChange={handleValueChange}
      >
        <SelectTrigger
          aria-label="Active tree"
          className="max-w-[40ch] truncate"
        >
          <SelectValue placeholder="Select a tree" />
        </SelectTrigger>
        <SelectContent>
          {trees.map((tree) => (
            <SelectItem key={tree.id} value={tree.id}>
              {tree.name}
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value={SENTINEL_CREATE}>New tree…</SelectItem>
          <SelectItem value={SENTINEL_RENAME} disabled={lifecycleDisabled}>
            Rename current tree…
          </SelectItem>
          <SelectItem value={SENTINEL_DELETE} disabled={lifecycleDisabled}>
            Delete current tree…
          </SelectItem>
        </SelectContent>
      </Select>

      <CreateTreeDialog open={showCreate} onOpenChange={setShowCreate} />
      {activeTreeId !== null && (
        <>
          <RenameTreeDialog
            open={showRename}
            onOpenChange={setShowRename}
            treeId={activeTreeId}
          />
          <DeleteTreeDialog
            open={showDelete}
            onOpenChange={setShowDelete}
            treeId={activeTreeId}
          />
        </>
      )}
    </>
  );
}
