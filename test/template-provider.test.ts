import { describe, it, expect } from "vitest";
import { templateProvider } from "../src/render/template-provider";
import { WIZARDS } from "../src/personas/generated/wizards";

describe("templateProvider", () => {
  it("resolves wizards/grumbel-system to non-empty Mustache", () => {
    const text = templateProvider.resolve("wizards/grumbel-system");
    expect(text).toBeDefined();
    expect(text!.length).toBeGreaterThan(50);
    expect(text!).toContain("Grumbel");
  });

  it("returns undefined for unknown refs", () => {
    expect(templateProvider.resolve("wizards/nonexistent")).toBeUndefined();
  });

  it("has refs for every wizard × 2 prompts + 2 verdict templates", () => {
    const refs = [
      ...WIZARDS.flatMap((w) => [`wizards/${w.id}-system`, `wizards/${w.id}-user`]),
      "verdict/system",
      "verdict/user",
    ];
    for (const r of refs) {
      expect(templateProvider.resolve(r), `ref ${r}`).toBeDefined();
    }
  });
});
