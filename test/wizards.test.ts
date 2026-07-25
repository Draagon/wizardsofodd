import { describe, it, expect } from "vitest";
import { WIZARDS } from "../src/personas/generated/wizards";
import { WIZARD_REGISTRY } from "../src/personas/generated/registry";
import { templateProvider } from "../src/render/template-provider";

describe("WIZARDS (generated from data/wizards/*.yaml)", () => {
  it("has 10 entries", () => {
    expect(WIZARDS).toHaveLength(10);
  });

  it("ids are unique", () => {
    const ids = WIZARDS.map((w) => w.id);
    expect(new Set(ids).size).toBe(10);
  });

  it("expected wizard ids present", () => {
    const ids = WIZARDS.map((w) => w.id).sort();
    expect(ids).toEqual(["brik", "domino", "fabula", "grumbel", "lorekeeper", "nix", "ozzimandias", "pib", "tally", "vexil"]);
  });

  it("only Lorekeeper uses search", () => {
    const usesSearch = WIZARDS.filter((w) => w.usesSearch).map((w) => w.id);
    expect(usesSearch).toEqual(["lorekeeper"]);
  });

  it("bickersWith references resolve to real wizard ids", () => {
    const ids = new Set(WIZARDS.map((w) => w.id));
    for (const w of WIZARDS) {
      const targets = (w.bickersWith ?? []) as readonly string[];
      for (const target of targets) {
        expect(ids).toContain(target);
      }
    }
  });

  it("ordering is deterministic (sorted by order then id)", () => {
    const sorted = [...WIZARDS].sort((a, b) => {
      const ao = a.order ?? Infinity, bo = b.order ?? Infinity;
      return ao !== bo ? ao - bo : a.id.localeCompare(b.id);
    });
    expect(WIZARDS).toEqual(sorted);
  });

  it("every wizard has a techniqueBlurb within the schema's maxLength", () => {
    for (const w of WIZARDS) {
      expect(typeof w.techniqueBlurb).toBe("string");
      expect(w.techniqueBlurb.length).toBeGreaterThan(0);
      expect(w.techniqueBlurb.length).toBeLessThanOrEqual(280);
    }
  });

  it("every wizard declares defaultEnabled", () => {
    for (const w of WIZARDS) {
      expect(typeof w.defaultEnabled).toBe("boolean");
    }
  });

  it("the original five are defaultEnabled", () => {
    const on = WIZARDS.filter((w) => w.defaultEnabled).map((w) => w.id).sort();
    expect(on).toEqual(["grumbel", "lorekeeper", "ozzimandias", "pib", "vexil"]);
  });
});

describe("WIZARD_REGISTRY", () => {
  it("has 10 entries matching WIZARDS", () => {
    expect(WIZARD_REGISTRY).toHaveLength(10);
    expect(WIZARD_REGISTRY.map((e) => e.wizard.id)).toEqual(WIZARDS.map((w) => w.id));
  });

  it("each entry has renderSystem + renderUser functions", () => {
    for (const entry of WIZARD_REGISTRY) {
      expect(typeof entry.renderSystem).toBe("function");
      expect(typeof entry.renderUser).toBe("function");
    }
  });

  it("renderSystem produces non-empty text containing the wizard's name", () => {
    const grumbel = WIZARD_REGISTRY.find((e) => e.wizard.id === "grumbel")!;
    const out = grumbel.renderSystem(
      { hasRivals: true, rivals: [{ name: "vexil", last: true }], turnNumber: 1 } as never,
      templateProvider,
    );
    expect(out.length).toBeGreaterThan(50);
    expect(out).toContain("Grumbel");
  });
});
