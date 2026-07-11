import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../src/db/client";
import {
  insertCouncil, recordWizardTurn, recordErrorTurn, finalizeCouncil,
  setCouncilError, getCouncilWithTurns,
} from "../src/db/queries";
import type { WizardOutput } from "../src/db/generated/WizardOutput";
import type { VerdictOutput } from "../src/db/generated/VerdictOutput";

const FAKE_WIZARD_OUTPUT: WizardOutput = {
  stance: "supports",
  takeMarkdown: "Ship it.",
  oneLineSummary: "Just ship.",
  confidence: 0.7,
  keyClaims: ["Risk is low.", "Reward is high."],
};

const FAKE_VERDICT: VerdictOutput = {
  stance: "yes",
  confidence: 0.6,
  takeMarkdown: "Yes, with caveats.",
  dissents: [],
  evidenceQuality: "mixed",
};

describe("D1 + Drizzle smoke", () => {
  it("inserts and reads a council row", async () => {
    const db = getDb(env);
    const id = "smk-" + Math.random().toString(36).slice(2, 8);
    await db.insert(schema.councils).values({
      id,
      visitorId: "v-test",
      question: "smoke?",
      status: "pending",
      createdAt: Date.now(),
    });
    const rows = await db.select().from(schema.councils).where(eq(schema.councils.id, id));
    expect(rows).toHaveLength(1);
    expect(rows[0].question).toBe("smoke?");
  });
});

describe("queries", () => {
  it("insertCouncil retries on slug collision and returns the slug", async () => {
    const db = getDb(env);
    const stuck = "AaAaAaAa";
    await db.insert(schema.councils).values({
      id: stuck, visitorId: "v-test", question: "first",
      status: "complete", createdAt: Date.now(),
    });
    const id = await insertCouncil(db, { visitorId: "v-test", question: "second", forcedFirstSlug: stuck });
    expect(id).not.toBe(stuck);
    const row = await db.select().from(schema.councils).where(eq(schema.councils.id, id));
    expect(row).toHaveLength(1);
    expect(row[0].status).toBe("pending");
  });

  it("recordWizardTurn writes a turn row and flips status to partial", async () => {
    const db = getDb(env);
    const id = await insertCouncil(db, { visitorId: "v-test", question: "q?" });
    await recordWizardTurn(db, id, {
      ordinal: 1, wizardId: "grumbel", wizardName: "Grumbel the Overcaffeinated",
      take: FAKE_WIZARD_OUTPUT,
    });
    const row = (await db.select().from(schema.councils).where(eq(schema.councils.id, id)))[0];
    expect(row.status).toBe("partial");
    const turns = await db.select().from(schema.councilTurns).where(eq(schema.councilTurns.councilId, id));
    expect(turns).toHaveLength(1);
    expect(turns[0].kind).toBe("wizard");
    expect(turns[0].stance).toBe("supports");
    expect(turns[0].takeMarkdown).toBe("Ship it.");
    expect(turns[0].confidence).toBe(0.7);
    expect(turns[0].keyClaims).toEqual(["Risk is low.", "Reward is high."]);
    expect(turns[0].citations).toBeNull();
  });

  it("recordErrorTurn writes an error turn with the reason as takeMarkdown", async () => {
    const db = getDb(env);
    const id = await insertCouncil(db, { visitorId: "v-test", question: "q?" });
    await recordErrorTurn(db, id, {
      ordinal: 1, wizardId: "vexil", wizardName: "Madame Vexil the Riddling",
      reason: "lost in thought",
    });
    const row = (await db.select().from(schema.councils).where(eq(schema.councils.id, id)))[0];
    expect(row.status).toBe("partial");
    const turns = await db.select().from(schema.councilTurns).where(eq(schema.councilTurns.councilId, id));
    expect(turns).toHaveLength(1);
    expect(turns[0].kind).toBe("error");
    expect(turns[0].stance).toBe("abstains");
    expect(turns[0].takeMarkdown).toBe("lost in thought");
    expect(turns[0].confidence).toBe(0);
  });

  it("finalizeCouncil sets status=complete + structured verdict columns + completedAt", async () => {
    const db = getDb(env);
    const id = await insertCouncil(db, { visitorId: "v-test", question: "q?" });
    await finalizeCouncil(db, id, FAKE_VERDICT);
    const row = (await db.select().from(schema.councils).where(eq(schema.councils.id, id)))[0];
    expect(row.status).toBe("complete");
    expect(row.verdictStance).toBe("yes");
    expect(row.verdictConfidence).toBe(0.6);
    expect(row.verdictMarkdown).toBe("Yes, with caveats.");
    expect(row.verdictEvidenceQuality).toBe("mixed");
    expect(row.dissents).toEqual([]);
    expect(row.completedAt).toBeGreaterThan(0);
  });

  it("setCouncilError sets status=error + completedAt", async () => {
    const db = getDb(env);
    const id = await insertCouncil(db, { visitorId: "v-test", question: "q?" });
    await setCouncilError(db, id);
    const row = (await db.select().from(schema.councils).where(eq(schema.councils.id, id)))[0];
    expect(row.status).toBe("error");
    expect(row.completedAt).toBeGreaterThan(0);
  });

  it("getCouncilWithTurns returns ordered turns + the council", async () => {
    const db = getDb(env);
    const id = await insertCouncil(db, { visitorId: "v-test", question: "ordered?" });
    await recordWizardTurn(db, id, {
      ordinal: 2, wizardId: "vexil", wizardName: "Madame Vexil the Riddling",
      take: { ...FAKE_WIZARD_OUTPUT, takeMarkdown: "B" },
    });
    await recordWizardTurn(db, id, {
      ordinal: 1, wizardId: "grumbel", wizardName: "Grumbel the Overcaffeinated",
      take: { ...FAKE_WIZARD_OUTPUT, takeMarkdown: "A" },
    });
    const got = await getCouncilWithTurns(db, id);
    expect(got).not.toBeNull();
    expect(got!.council.question).toBe("ordered?");
    expect(got!.turns.map((t) => t.takeMarkdown)).toEqual(["A", "B"]);
  });

  it("getCouncilWithTurns returns null for unknown id", async () => {
    const db = getDb(env);
    expect(await getCouncilWithTurns(db, "nonexistent")).toBeNull();
  });
});
