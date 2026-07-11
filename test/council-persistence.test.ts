import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { getDb } from "../src/db/client";
import {
  insertCouncil, finalizeCouncil, getCouncilWithTurns,
} from "../src/db/queries";
import type { VerdictOutput } from "../src/db/generated/VerdictOutput";

describe("finalizeCouncil persists the W3 verdict fields", () => {
  it("round-trips agreements/splits/verifyNote through D1", async () => {
    const db = getDb(env);
    const slug = await insertCouncil(db, { visitorId: "v1", question: "q?" });
    const verdict: VerdictOutput = {
      stance: "it_depends",
      confidence: 0.6,
      takeMarkdown: "m",
      dissents: [],
      evidenceQuality: "mixed",
      agreements: ["a1", "a2"],
      splits: ["s1"],
      verifyNote: "check the numbers",
    };
    await finalizeCouncil(db, slug, verdict);
    const row = await getCouncilWithTurns(db, slug);
    expect(row?.council.verdictAgreements).toEqual(["a1", "a2"]);
    expect(row?.council.verdictSplits).toEqual(["s1"]);
    expect(row?.council.verdictVerifyNote).toBe("check the numbers");
  });

  it("reads back null for the W3 fields when the verdict omits them", async () => {
    // Proves the `?? null` coercions in finalizeCouncil are load-bearing: an
    // optional field left undefined must persist as SQL NULL, not be skipped.
    const db = getDb(env);
    const slug = await insertCouncil(db, { visitorId: "v2", question: "q2?" });
    const verdict: VerdictOutput = {
      stance: "yes",
      confidence: 1,
      takeMarkdown: "yes",
      dissents: [],
      evidenceQuality: "strong",
    };
    await finalizeCouncil(db, slug, verdict);
    const row = await getCouncilWithTurns(db, slug);
    expect(row?.council.verdictAgreements).toBeNull();
    expect(row?.council.verdictSplits).toBeNull();
    expect(row?.council.verdictVerifyNote).toBeNull();
  });
});
