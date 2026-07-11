import { eq } from "drizzle-orm";
import { schema, type Db } from "./client";
import { newSlug } from "./slug";
import type { WizardOutput } from "./generated/WizardOutput";
import type { VerdictOutput } from "./generated/VerdictOutput";
// Consume the codegen'd typed finders — including the ADR-0038 reverse finder —
// rather than re-hand-rolling the same selects. The bespoke writes below stay
// hand-written, but OVER these generated row types (Council / CouncilTurn).
import { findCouncilById } from "./generated/Council.queries";
import { findCouncilTurnsByCouncil } from "./generated/CouncilTurn.queries";
import type { Council } from "./generated/Council";
import type { CouncilTurn } from "./generated/CouncilTurn";

const { councils, councilTurns } = schema;

export interface InsertCouncilArgs {
  visitorId: string;
  question: string;
  /** test hook only: forces the first attempt's slug to be a known value. */
  forcedFirstSlug?: string;
}

/** Insert a new council with status='pending', retrying on slug collision. Returns the slug. */
export async function insertCouncil(db: Db, args: InsertCouncilArgs): Promise<string> {
  const now = Date.now();
  let slug = args.forcedFirstSlug ?? newSlug();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await db.insert(councils).values({
        id: slug,
        visitorId: args.visitorId,
        question: args.question,
        status: "pending",
        createdAt: now,
      });
      return slug;
    } catch (err) {
      if (attempt === 4) throw err;
      slug = newSlug();
    }
  }
  throw new Error("unreachable");
}

export interface RecordWizardTurnArgs {
  ordinal: number;
  wizardId: string;
  wizardName: string;
  take: WizardOutput;
}

export interface RecordErrorTurnArgs {
  ordinal: number;
  wizardId: string;
  wizardName: string;
  reason: string;
}

/** Recording any turn advances the council from 'pending' to 'partial'. */
async function advanceCouncilToPartial(db: Db, councilId: string): Promise<void> {
  await db.update(councils).set({ status: "partial" }).where(eq(councils.id, councilId));
}

/** Inserts a wizard turn (structured) and flips council.status to 'partial'. */
export async function recordWizardTurn(db: Db, councilId: string, t: RecordWizardTurnArgs): Promise<void> {
  await db.insert(councilTurns).values({
    councilId,
    ordinal: t.ordinal,
    round: 0, // vestigial column (follow-up rounds removed); see meta-council-turn.yaml
    wizardId: t.wizardId,
    wizardName: t.wizardName,
    kind: "wizard",
    stance: t.take.stance,
    takeMarkdown: t.take.takeMarkdown,
    oneLineSummary: t.take.oneLineSummary,
    confidence: t.take.confidence,
    keyClaims: t.take.keyClaims ?? [],
    citations: t.take.citations ?? null,
  });
  await advanceCouncilToPartial(db, councilId);
}

/** Inserts an error turn (wizard's response could not be parsed). */
export async function recordErrorTurn(db: Db, councilId: string, t: RecordErrorTurnArgs): Promise<void> {
  await db.insert(councilTurns).values({
    councilId,
    ordinal: t.ordinal,
    round: 0, // vestigial column (follow-up rounds removed); see meta-council-turn.yaml
    wizardId: t.wizardId,
    wizardName: t.wizardName,
    kind: "error",
    stance: "abstains",
    takeMarkdown: t.reason,
    oneLineSummary: t.reason.slice(0, 140),
    confidence: 0,
    keyClaims: [],
    citations: null,
  });
  await advanceCouncilToPartial(db, councilId);
}

/** The verdict columns for a council's verdict. */
function verdictColumns(v: VerdictOutput) {
  return {
    verdictStance: v.stance,
    verdictConfidence: v.confidence,
    verdictMarkdown: v.takeMarkdown,
    verdictEvidenceQuality: v.evidenceQuality,
    dissents: v.dissents,
    verdictAgreements: v.agreements ?? null,
    verdictSplits: v.splits ?? null,
    verdictVerifyNote: v.verifyNote ?? null,
  };
}

/** Marks status=complete with the structured verdict + completion time. */
export async function finalizeCouncil(db: Db, councilId: string, v: VerdictOutput): Promise<void> {
  await db
    .update(councils)
    .set({ status: "complete", ...verdictColumns(v), completedAt: Date.now() })
    .where(eq(councils.id, councilId));
}

/** Marks status=error (stream-level catastrophic failure). */
export async function setCouncilError(db: Db, councilId: string): Promise<void> {
  await db
    .update(councils)
    .set({ status: "error", completedAt: Date.now() })
    .where(eq(councils.id, councilId));
}

export interface CouncilWithTurns {
  council: Council;
  turns: CouncilTurn[];
}

export async function getCouncilWithTurns(db: Db, id: string): Promise<CouncilWithTurns | null> {
  const council = await findCouncilById(db, id);
  if (!council) return null;
  // findCouncilTurnsByCouncil is the generated ADR-0038 reverse finder (from the
  // CouncilTurn→Council FK). It doesn't order, so sort by ordinal for display.
  const turns = await findCouncilTurnsByCouncil(db, id);
  turns.sort((a, b) => a.ordinal - b.ordinal);
  return { council, turns };
}

/** Rehydrate the structured WizardOutput from a turn row. JSON columns are already decoded by Drizzle. */
export function turnToWizardOutput(turn: CouncilTurn): WizardOutput {
  return {
    stance: turn.stance,
    takeMarkdown: turn.takeMarkdown,
    oneLineSummary: turn.oneLineSummary,
    confidence: turn.confidence,
    keyClaims: turn.keyClaims,
    ...(turn.citations ? { citations: turn.citations } : {}),
  };
}

/** Rebuild a VerdictOutput from a council row's verdict columns (null → absent/empty). */
export function councilVerdict(c: Council): VerdictOutput | null {
  if (!c.verdictStance || !c.verdictMarkdown) return null;
  return {
    stance: c.verdictStance,
    confidence: c.verdictConfidence ?? 0,
    takeMarkdown: c.verdictMarkdown,
    dissents: c.dissents ?? [],
    evidenceQuality: c.verdictEvidenceQuality ?? "none",
    agreements: c.verdictAgreements ?? [],
    splits: c.verdictSplits ?? [],
    ...(c.verdictVerifyNote ? { verifyNote: c.verdictVerifyNote } : {}),
  };
}
