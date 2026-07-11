import { describe, it, expect, vi } from "vitest";
import { WIZARD_REGISTRY } from "../src/personas/generated/registry";
import { defaultRegistry, selectRegistry } from "../src/council/registry-selection";

describe("defaultRegistry", () => {
  it("excludes entries whose defaultEnabled is false (filter logic)", () => {
    // Synthetic registry exercising BOTH branches in isolation — a mixed
    // fixture is the clearest unit test of the filter regardless of how the
    // live roster's defaultEnabled flags happen to be set.
    const mixed = [
      { wizard: { id: "a", defaultEnabled: true }, renderSystem: vi.fn(), renderUser: vi.fn() },
      { wizard: { id: "b", defaultEnabled: false }, renderSystem: vi.fn(), renderUser: vi.fn() },
      { wizard: { id: "c", defaultEnabled: true }, renderSystem: vi.fn(), renderUser: vi.fn() },
    ] as unknown as typeof WIZARD_REGISTRY;
    const ids = defaultRegistry(mixed).map((e) => e.wizard.id);
    expect(ids).toEqual(["a", "c"]);
  });

  it("returns only wizards whose defaultEnabled is true", () => {
    const ids = defaultRegistry(WIZARD_REGISTRY).map((e) => e.wizard.id).sort();
    expect(ids).toEqual(["grumbel", "lorekeeper", "ozzimandias", "pib", "vexil"]);
  });

  it("preserves the registry order of the kept entries", () => {
    const kept = defaultRegistry(WIZARD_REGISTRY);
    const fullOrder = WIZARD_REGISTRY.filter((e) => e.wizard.defaultEnabled).map((e) => e.wizard.id);
    expect(kept.map((e) => e.wizard.id)).toEqual(fullOrder);
  });
});

describe("selectRegistry", () => {
  it("returns only the requested ids, in registry order", () => {
    const ids = selectRegistry(WIZARD_REGISTRY, ["pib", "grumbel"]).map((e) => e.wizard.id);
    expect(ids).toEqual(["grumbel", "pib"]);
  });
  it("ignores unknown ids", () => {
    const ids = selectRegistry(WIZARD_REGISTRY, ["grumbel", "nope"]).map((e) => e.wizard.id);
    expect(ids).toEqual(["grumbel"]);
  });
  it("includes a non-default wizard when explicitly selected", () => {
    const ids = selectRegistry(WIZARD_REGISTRY, ["brik"]).map((e) => e.wizard.id);
    expect(ids).toEqual(["brik"]);
  });
  it("falls back to the default set when ids is undefined", () => {
    const ids = selectRegistry(WIZARD_REGISTRY).map((e) => e.wizard.id).sort();
    expect(ids).toEqual(["grumbel", "lorekeeper", "ozzimandias", "pib", "vexil"]);
  });
  it("falls back to the default set when ids is empty or all-unknown", () => {
    expect(selectRegistry(WIZARD_REGISTRY, []).map((e) => e.wizard.id).sort())
      .toEqual(["grumbel", "lorekeeper", "ozzimandias", "pib", "vexil"]);
    expect(selectRegistry(WIZARD_REGISTRY, ["ghost"]).map((e) => e.wizard.id).sort())
      .toEqual(["grumbel", "lorekeeper", "ozzimandias", "pib", "vexil"]);
  });
});
