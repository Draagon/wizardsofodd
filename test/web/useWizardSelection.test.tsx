import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWizardSelection, SELECTION_STORAGE_KEY } from "../../src/web/hooks/useWizardSelection";
import { WIZARDS } from "../../src/personas/generated/wizards";

const defaultIds = WIZARDS.filter((w) => w.defaultEnabled).map((w) => w.id).sort();

describe("useWizardSelection", () => {
  beforeEach(() => localStorage.clear());

  it("seeds from defaultEnabled when no localStorage", () => {
    const { result } = renderHook(() => useWizardSelection());
    expect([...result.current.enabledIds].sort()).toEqual(defaultIds);
  });

  it("toggle removes then re-adds an id and persists", () => {
    const { result } = renderHook(() => useWizardSelection());
    act(() => result.current.toggle("grumbel"));
    expect(result.current.enabledIds.has("grumbel")).toBe(false);
    expect(JSON.parse(localStorage.getItem(SELECTION_STORAGE_KEY)!)).not.toContain("grumbel");
    act(() => result.current.toggle("grumbel"));
    expect(result.current.enabledIds.has("grumbel")).toBe(true);
  });

  it("can enable a non-default wizard", () => {
    const { result } = renderHook(() => useWizardSelection());
    act(() => result.current.toggle("brik"));
    expect(result.current.enabledIds.has("brik")).toBe(true);
    expect(result.current.count).toBe(defaultIds.length + 1);
  });

  it("loads a persisted selection and drops ids no longer in the roster", () => {
    localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify(["pib", "ghost"]));
    const { result } = renderHook(() => useWizardSelection());
    expect([...result.current.enabledIds]).toEqual(["pib"]);
  });

  it("re-seeds to the default set when the stored selection is empty or all-stale", () => {
    localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify(["ghost1", "ghost2"]));
    const { result } = renderHook(() => useWizardSelection());
    expect([...result.current.enabledIds].sort()).toEqual(defaultIds);
  });
});
