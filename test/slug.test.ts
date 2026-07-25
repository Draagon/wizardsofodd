import { describe, it, expect } from "vitest";
import { newSlug } from "../src/db/slug";
import { Council } from "../src/db/generated/Council";

describe("newSlug", () => {
  it("produces 8 chars from a safe alphabet (no 0/O/I/l/1)", () => {
    for (let i = 0; i < 200; i += 1) {
      const s = newSlug();
      expect(s).toHaveLength(8);
      expect(s).toMatch(/^[a-zA-Z0-9]+$/);
      expect(s).not.toMatch(/[0OIl1]/);
    }
  });

  it("every generated slug satisfies the codegen'd Council.id validator", () => {
    // Generation single-sources its alphabet+length from Council.id's regex, so
    // every slug it emits must pass that exact validator. Locks generation to
    // validation against the real pattern (not a hand-copied `[a-zA-Z0-9]`).
    const pattern = Council.id.rules.pattern.value;
    for (let i = 0; i < 200; i += 1) {
      expect(newSlug()).toMatch(pattern);
    }
  });

  it("returns distinct values across many calls", () => {
    const set = new Set(Array.from({ length: 1000 }, () => newSlug()));
    expect(set.size).toBeGreaterThan(995);
  });
});
