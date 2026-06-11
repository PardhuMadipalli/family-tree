import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { StatusBanner } from "@/components/StatusBanner";
import { useActiveTreeStore } from "@/lib/activeTreeStore";

// These tests exercise the StatusBanner against the real Zustand store by
// driving it via setState — that's enough to validate the rendering rules
// without spinning up Dexie/IndexedDB.

const baseState = useActiveTreeStore.getState();

function resetStore(partial: Partial<ReturnType<typeof useActiveTreeStore.getState>>) {
  useActiveTreeStore.setState(
    {
      ...baseState,
      // Sensible defaults the individual tests can override.
      trees: [],
      activeTreeId: null,
      isReady: true,
      status: "ok",
      error: null,
      ...partial,
    },
    /* replace */ true,
  );
}

beforeEach(() => {
  resetStore({});
});

afterEach(() => {
  cleanup();
  resetStore({});
});

describe("StatusBanner", () => {
  it("renders nothing while the active-tree store has not finished bootstrap", () => {
    resetStore({ isReady: false, status: "no-selection" });
    const { container } = render(<StatusBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when status is 'ok' and there is no error", () => {
    resetStore({ status: "ok", error: null });
    const { container } = render(<StatusBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows 'No tree selected' when status is 'no-selection'", () => {
    resetStore({ status: "no-selection", error: null });
    render(<StatusBanner />);
    expect(screen.getByTestId("status-banner")).toHaveTextContent(
      "No tree selected",
    );
  });

  it("shows 'Selected tree is unavailable' when status is 'unavailable'", () => {
    resetStore({ status: "unavailable", error: null });
    render(<StatusBanner />);
    expect(screen.getByTestId("status-banner")).toHaveTextContent(
      "Selected tree is unavailable",
    );
  });

  it("renders the error message when one is set, overriding status copy", () => {
    resetStore({ status: "no-selection", error: "Selection could not be saved" });
    render(<StatusBanner />);
    const banner = screen.getByTestId("status-banner");
    expect(banner).toHaveTextContent("Selection could not be saved");
    expect(banner).not.toHaveTextContent("No tree selected");
    // Error banners use the assertive aria-live region.
    expect(banner).toHaveAttribute("role", "alert");
  });

  it("dismisses the error via the ✕ button by calling clearError", async () => {
    resetStore({ status: "ok", error: "Tree could not be loaded" });
    render(<StatusBanner />);

    const dismiss = screen.getByRole("button", { name: /dismiss/i });
    await userEvent.click(dismiss);

    expect(useActiveTreeStore.getState().error).toBeNull();
  });

  it("does not show a dismiss button for status-only banners", () => {
    resetStore({ status: "no-selection", error: null });
    render(<StatusBanner />);
    expect(screen.queryByRole("button", { name: /dismiss/i })).toBeNull();
  });
});
