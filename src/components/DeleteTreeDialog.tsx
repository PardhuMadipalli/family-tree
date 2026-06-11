"use client";

import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { useActiveTreeStore } from "@/lib/activeTreeStore";
import type { Id } from "@/lib/domain";

interface DeleteTreeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Identifier of the tree to delete. When `null`, the dialog renders a
   *  fallback message and disables the Delete control (Req 6.1). */
  treeId: Id | null;
}

/**
 * shadcn `AlertDialog` confirming deletion of a tree (task 10.4 / Req 6.1,
 * 6.6, 6.7).
 *
 * Body names the tree and warns that deletion is permanent and cascades to
 * every record. On confirm calls `useActiveTreeStore.deleteTree(id)`; on
 * cancel/dismiss the registry, records, and Active_Tree are left
 * unchanged.
 */
export function DeleteTreeDialog({
  open,
  onOpenChange,
  treeId,
}: DeleteTreeDialogProps) {
  const trees = useActiveTreeStore((s) => s.trees);
  const deleteTree = useActiveTreeStore((s) => s.deleteTree);

  const tree = treeId !== null ? trees.find((t) => t.id === treeId) : undefined;
  const treeMissing = treeId === null || tree === undefined;

  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async (e: React.MouseEvent) => {
    // Prevent Radix from auto-closing the dialog before the async deletion
    // completes; we close explicitly once the store finishes.
    e.preventDefault();
    if (treeMissing || submitting) return;

    setSubmitting(true);
    try {
      await deleteTree(treeId);
    } finally {
      setSubmitting(false);
      onOpenChange(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {treeMissing
              ? "Delete tree"
              : `Delete "${tree.name}"`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {treeMissing
              ? "No tree selected to delete."
              : "This will permanently remove the tree and all of its people, unions, and parent-child links."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={treeMissing || submitting}
            className={buttonVariants({ variant: "destructive" })}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
