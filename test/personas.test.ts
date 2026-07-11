import { describe, it, expect } from "vitest";
import { WIZARDS as GUILD } from "../src/personas/generated/wizards";

const getPersona = (id: string) => GUILD.find((p) => p.id === id);

describe("guild", () => {
  it("has exactly ten wizards with unique ids", () => {
    expect(GUILD).toHaveLength(10);
    const ids = GUILD.map((p) => p.id);
    expect(new Set(ids).size).toBe(10);
  });

  it("every required field is non-empty", () => {
    // Phase F: the per-wizard prose (domain, quirk, voiceRules, refusalStyle,
    // technique instructions) lives in Mustache templates now, not on the
    // Wizard shape. The structured fields that remain on Wizard are these:
    for (const p of GUILD) {
      for (const key of ["id", "name", "title", "technique"] as const) {
        expect(p[key], `${p.id}.${key}`).toBeTruthy();
      }
    }
  });

  it("bickersWith references only real wizard ids and never self", () => {
    const ids = new Set(GUILD.map((p) => p.id));
    for (const p of GUILD) {
      const targets = (p.bickersWith ?? []) as readonly string[];
      for (const other of targets) {
        expect(ids.has(other), `${p.id} bickers with unknown ${other}`).toBe(true);
        expect(other).not.toBe(p.id);
      }
    }
  });

  it("getPersona finds by id and returns undefined otherwise", () => {
    expect(getPersona("grumbel")?.name).toBe("Grumbel");
    expect(getPersona("ozzimandias")?.title).toBe("the Inevitable");
    expect(getPersona("pib")?.id).toBe("pib");
    expect(getPersona("nope")).toBeUndefined();
  });

  it("name never embeds its own title, so `${name} ${title}` doesn't double the epithet", () => {
    // Guards against e.g. name "Pib the Smol" + title "the Smol" => "Pib the Smol the Smol".
    for (const p of GUILD) {
      expect(p.name.includes(p.title), `${p.id} name embeds its title`).toBe(false);
    }
  });

  it("every wizard names a technique", () => {
    for (const p of GUILD) {
      expect(p.technique, `${p.id}.technique missing`).toBeTruthy();
      // technique is a short tag like "pre-mortem", "inversion", "rag" — the
      // full prose instructions live in the per-wizard Mustache system template.
      expect(p.technique.length, `${p.id}.technique tag empty`).toBeGreaterThan(2);
    }
  });

  it("all wizard technique tags are unique", () => {
    const tags = GUILD.map((p) => p.technique);
    expect(new Set(tags).size).toBe(GUILD.length);
  });
});
