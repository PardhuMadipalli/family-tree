"use client";

import { X } from "lucide-react";

import { useActiveTreeStore } from "@/lib/activeTreeStore";

/**
 * StatusBanner (task 9.2 / Req 1.5, 1.6, 2.7, 3.8, 6.7).
 *
 * Surfaces no-selection / unavailable / error indications in a single
 * inline banner rendered below the top bar and above `<main>`. Priority,
 * highest first:
 *   1. `error !== null` -> show the error message with a dismiss control.
 *   2. `status === 'unavailable'` -> "Selected tree is unavailable".
 *   3. `status === 'no-selection'` -> "No tree selected".
 *
 * The component renders nothing when none of the above apply, or while
 * the active-tree store has not yet finished its bootstrap (so we avoid
 * a transient "No tree selected" flash before resolution completes).
 *
 * Dismiss only clears the transient `error` field via the store's
 * `clearError` action; it does not touch the persisted Active_Tree or
 * the registry. Status-driven banners ('no-selection' / 'unavailable')
 * are not dismissible because their copy reflects the current state.
 */
export function StatusBanner() {
  const isReady = useActiveTreeStore((s) => s.isReady);
  const status = useActiveTreeStore((s) => s.status);
  const error = useActiveTreeStore((s) => s.error);
  const clearError = useActiveTreeStore((s) => s.clearError);

  // Don't render anything until bootstrap finishes so the user never sees
  // a transient banner while the Active_Tree is still being resolved.
  if (!isReady) return null;

  // Decide what to show. Error wins over status because it represents the
  // most recent user-visible failure (e.g. "Selection could not be saved",
  // "Tree could not be loaded", "Tree could not be deleted").
  let message: string | null = null;
  let tone: "error" | "info" = "info";
  let dismissible = false;

  if (error !== null) {
    message = error;
    tone = "error";
    dismissible = true;
  } else if (status === "unavailable") {
    message = "Selected tree is unavailable";
    tone = "info";
  } else if (status === "no-selection") {
    message = "No tree selected";
    tone = "info";
  }

  if (message === null) return null;

  // Tone-driven palette: error uses destructive colors so the failure is
  // visually distinct; status uses muted neutrals so it sits quietly.
  const toneClass =
    tone === "error"
      ? "border-destructive/30 bg-destructive/10 text-destructive dark:border-destructive/40 dark:bg-destructive/20"
      : "border-black/10 bg-black/[0.03] text-black/70 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/70";

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      data-testid="status-banner"
      className={`mx-auto max-w-6xl px-4 py-2`}
    >
      <div
        className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm ${toneClass}`}
      >
        <span className="truncate">{message}</span>
        {dismissible ? (
          <button
            type="button"
            aria-label="Dismiss"
            onClick={clearError}
            className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-black/5 dark:hover:bg-white/10 shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
