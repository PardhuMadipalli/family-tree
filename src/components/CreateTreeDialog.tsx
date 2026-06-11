"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActiveTreeStore } from "@/lib/activeTreeStore";

interface CreateTreeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Create-tree dialog (task 10.2 / Req 4.1–4.5).
 *
 * Submits to `useActiveTreeStore.createTree(name)`. The store handles
 * activation of the new tree on success; this dialog only owns the form
 * state and surfaces validation messages from the lifecycle service:
 *   - reason `'empty'`    -> "A tree name is required"
 *   - reason `'too-long'` -> "Tree name exceeds the maximum allowed length"
 */
export function CreateTreeDialog({ open, onOpenChange }: CreateTreeDialogProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const createTree = useActiveTreeStore((state) => state.createTree);

  const resetForm = () => {
    setName("");
    setError(null);
    setIsSubmitting(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      resetForm();
    }
    onOpenChange(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await createTree(name);
      if (result.ok) {
        // Store has already activated the new tree; just close the dialog.
        resetForm();
        onOpenChange(false);
        return;
      }

      if (result.reason === "empty") {
        setError("A tree name is required");
      } else if (result.reason === "too-long") {
        setError("Tree name exceeds the maximum allowed length");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create new tree</DialogTitle>
          <DialogDescription>
            Add a new family tree. The new tree will become the active tree.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="create-tree-name">Tree name</Label>
              <Input
                id="create-tree-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="e.g., My Family Tree"
                autoFocus
                aria-invalid={error !== null}
              />
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
