import { describe, it, expect } from "vitest";
import { env, SELF } from "cloudflare:test";
import { getDb, schema } from "../src/db/client";
import { finalizeCouncil } from "../src/db/queries";

// Insert a complete council into the test D1 so the share endpoint has
// something to render.
async function seedComplete(slug: string): Promise<void> {
  const db = getDb(env);
  await db.insert(schema.councils).values({
    id: slug, visitorId: "v", question: "Test?", status: "complete",
    verdictStance: "yes", verdictConfidence: 0.5, verdictMarkdown: "Yes.",
    verdictEvidenceQuality: "thin", dissents: [],
    createdAt: 1, completedAt: 2,
  });
  await db.insert(schema.councilTurns).values({
    councilId: slug, ordinal: 1, round: 0,
    wizardId: "grumbel", wizardName: "G", kind: "wizard",
    stance: "supports", takeMarkdown: "ship.", oneLineSummary: "ship",
    confidence: 0.7, keyClaims: [], citations: null,
  });
}

describe("GET /c/:slug — share HTML", () => {
  it("returns 200 with HTML for a complete council", async () => {
    await seedComplete("aShareAA");
    const res = await SELF.fetch("https://wizardsofodd.com/c/aShareAA");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const body = await res.text();
    expect(body).toContain("Verdict of the Guild");
    expect(body).toContain("Test?");
  });

  it("returns 404 for an unknown slug", async () => {
    const res = await SELF.fetch("https://wizardsofodd.com/c/nonexist");
    expect(res.status).toBe(404);
  });

  it("returns a fallback HTML page for a partial council (no og:image)", async () => {
    const db = getDb(env);
    await db.insert(schema.councils).values({
      id: "bPartAAA", visitorId: "v", question: "?", status: "partial",
      createdAt: 1,
    });
    const res = await SELF.fetch("https://wizardsofodd.com/c/bPartAAA");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("still in session");
    expect(body).not.toContain('property="og:image"');
  });

  it("rejects malformed slugs with 404", async () => {
    // The slug shape is fixed by the Phase A generator: 8 chars from a safe
    // alphabet. The handler validates shape before hitting D1.
    const res = await SELF.fetch("https://wizardsofodd.com/c/not-a-real-slug");
    expect(res.status).toBe(404);
  });

  it("renders agreements, splits, and verifyNote in the share HTML", async () => {
    const db = getDb(env);
    await db.insert(schema.councils).values({
      id: "dAgreeAA", visitorId: "v", question: "Agree?", status: "pending",
      createdAt: 1,
    });
    await db.insert(schema.councilTurns).values({
      councilId: "dAgreeAA", ordinal: 1, round: 0,
      wizardId: "grumbel", wizardName: "G", kind: "wizard",
      stance: "supports", takeMarkdown: "ship.", oneLineSummary: "ship",
      confidence: 0.7, keyClaims: [], citations: null,
    });
    await finalizeCouncil(db, "dAgreeAA", {
      stance: "yes", confidence: 0.8, takeMarkdown: "Yes.", dissents: [],
      evidenceQuality: "strong",
      agreements: ["converged point"],
      splits: ["the split"],
      verifyNote: "verify this",
    });
    const res = await SELF.fetch("https://wizardsofodd.com/c/dAgreeAA");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("converged point");
    expect(html).toContain("the split");
    expect(html).toContain("verify this");
  });
});

describe("GET /c/:slug.json — share data", () => {
  it("returns 200 with the council + turns JSON for a complete council", async () => {
    await seedComplete("cJsonAAA");
    const res = await SELF.fetch("https://wizardsofodd.com/c/cJsonAAA.json");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    const body = (await res.json()) as { council: { id: string }; turns: unknown[] };
    expect(body.council.id).toBe("cJsonAAA");
    expect(body.turns).toHaveLength(1);
  });

  it("returns 404 for unknown slug", async () => {
    const res = await SELF.fetch("https://wizardsofodd.com/c/nojson00.json");
    expect(res.status).toBe(404);
  });
});
