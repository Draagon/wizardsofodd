import { describe, it, expect } from "vitest";
import { VerdictOutputInsertSchema, type VerdictOutput } from "../src/db/generated/VerdictOutput";

describe("VerdictOutput schema (W3 fields)", () => {
  it("accepts a verdict WITH agreements/splits/verifyNote", () => {
    const v: VerdictOutput = {
      stance: "it_depends",
      confidence: 0.5,
      takeMarkdown: "x",
      dissents: [],
      evidenceQuality: "mixed",
      agreements: ["they all want a runway"],
      splits: ["timing: now vs after funding"],
      verifyNote: "Verify the financials before acting.",
    };
    expect(VerdictOutputInsertSchema.parse(v)).toMatchObject({
      agreements: ["they all want a runway"],
      splits: ["timing: now vs after funding"],
      verifyNote: "Verify the financials before acting.",
    });
  });

  it("accepts a verdict WITHOUT the new fields (they are optional)", () => {
    const parsed = VerdictOutputInsertSchema.parse({
      stance: "no",
      confidence: 0.2,
      takeMarkdown: "x",
      dissents: [],
      evidenceQuality: "thin",
    });
    expect(parsed.stance).toBe("no");
  });
});
