"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useActiveTreeStore } from "@/lib/activeTreeStore";
import type { Id } from "@/lib/domain";

interface RenameTreeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Identifier of the tree to rename. When `null`, the dialog renders a
   *  fallback message and disables Save (Req 5.1). */
  treeId: Id | null;
}

/**
 * shadcn `Dialog` for renaming an existing tree. Pre-fills the input with
 * the current tree's name, validates via the active-tree store, and
 * surfaces messages identical to the create dialog (Req 5.1–5.5):
 *   - `'empty'`    -> "A tree name is required"
 *   - `'too-long'` -> "Tree name exceeds the maximum allowed length"
 */
export function RenameTreeDialog({
  open,
  onOpenChange,
  treeId,
}: RenameTreeDialogProps) {
  const trees = useActiveTreeStore((s) => s.trees);
  const renameActiveOrTree = useActiveTreeStore((s) => s.renameActiveOrTree);

  const tree = treeId !== null ? trees.find((t) => t.id === treeId) : undefined;

  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset the input to the tree's current name whenever the dialog opens
  // or the target tree changes (Req 5.1).
  useEffect(() => {
    if (open) {
      setName(tree?.name ?? "");
      setError(null);
    }
  }, [open, treeId, tree?.name]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (treeId === null || tree === undefined || submitting) return;

    setSubmitting(true);
    try {
      const result = await renameActiveOrTree(treeId, name);
      if (result.ok) {
        onOpenChange(false);
        return;
      }
      // Validation rejection: surface the matching message (Req 5.3, 5.4).
      if (result.reason === "empty") {
        setError("A tree name is required");
      } else {
        setError("Tree name exceeds the maximum allowed length");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  const treeMissing = treeId === null || tree === undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Rename tree</DialogTitle>
          <DialogDescription>
            {treeMissing
              ? "No tree selected to rename."
              : "Update the display name for this tree."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="rename-tree-name" className="text-right">
                Name
              </Label>
              <Input
                id="rename-tree-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error !== null) setError(null);
                }}
                className="col-span-3"
                placeholder="e.g., Smith Family"
                disabled={treeMissing}
                autoFocus
              />
            </div>
            {error !== null && (
              <p
                className="text-sm text-red-600 dark:text-red-400 text-right col-span-4"
                role="alert"
              >
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={treeMissing || submitting}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
