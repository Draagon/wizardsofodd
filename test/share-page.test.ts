import { describe, it, expect } from "vitest";
import { renderShareHtml } from "../src/render/share-html";
import type { CouncilWithTurns } from "../src/db/queries";

function fakeCouncil(overrides?: Partial<CouncilWithTurns>): CouncilWithTurns {
  return {
    council: {
      id: "abc12xyz",
      visitorId: "v",
      question: "What now?",
      status: "complete",
      verdictStance: "yes",
      verdictConfidence: 0.5,
      verdictMarkdown: "**Yes.**",
      verdictEvidenceQuality: "mixed",
      dissents: [],
      createdAt: 0,
      completedAt: 1,
    },
    turns: [
      {
        councilId: "abc12xyz",
        ordinal: 1,
        wizardId: "grumbel",
        wizardName: "Grumbel the Overcaffeinated",
        kind: "wizard",
        stance: "supports",
        takeMarkdown: "**Ship it.**",
        oneLineSummary: "Ship.",
        confidence: 0.7,
        keyClaims: ["A", "B"],
        citations: null,
      },
    ],
    ...overrides,
  } as unknown as CouncilWithTurns;
}

describe("renderShareHtml", () => {
  it("returns a full HTML document with OG meta + noindex", () => {
    const html = renderShareHtml(fakeCouncil());
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('property="og:title"');
    expect(html).toContain('property="og:description"');
    expect(html).toContain('property="og:image"');
    expect(html).toContain('name="robots" content="noindex"');
  });

  it("renders the question", () => {
    const html = renderShareHtml(fakeCouncil());
    expect(html).toContain("What now?");
  });

  it("renders each wizard turn", () => {
    const html = renderShareHtml(fakeCouncil());
    expect(html).toContain("Grumbel the Overcaffeinated");
    expect(html).toContain("Ship it");
  });

  it("renders the verdict markdown + stance", () => {
    const html = renderShareHtml(fakeCouncil());
    expect(html).toContain("Verdict of the Guild");
    expect(html).toMatch(/<strong>Yes\.?<\/strong>/);
  });

  it("emits a fallback page for partial/pending/error councils", () => {
    const partial = fakeCouncil();
    const partialPatched = {
      ...partial,
      council: { ...partial.council, status: "partial", verdictStance: null, verdictMarkdown: null },
    } as unknown as CouncilWithTurns;
    const html = renderShareHtml(partialPatched);
    expect(html).toContain("still in session");
    expect(html).not.toContain('property="og:image"');
  });
});
