import { eq } from "drizzle-orm";
import { schema, type Db } from "./client";
import { newSlug } from "./slug";
import type { WizardFramePayload } from "./generated/WizardFramePayload";
import type { ErrorFramePayload } from "./generated/ErrorFramePayload";
import type { VerdictOutput } from "./generated/VerdictOutput";
// Reads are generated (findCouncilWithTurns in ./generated/Council.queries, from
// Council's `turns` composition). The bespoke writes below stay hand-written,
// but OVER the generated row types (Council / CouncilTurn).
import type { Council } from "./generated/Council";
import { councilTurnFieldsFromWizardOutput } from "./generated/CouncilTurn.lineage";
import { CouncilStatusEnum } from "./generated/Council";

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
        status: CouncilStatusEnum.enum.pending,
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

/** A `wizard` stream frame's payload, plus the turn's position in the council. */
export type RecordWizardTurnArgs = WizardFramePayload & { ordinal: number };

/** An `error` stream frame's payload, plus the turn's position in the council. */
export type RecordErrorTurnArgs = ErrorFramePayload & { ordinal: number };

/** Recording any turn advances the council from 'pending' to 'partial'. */
async function advanceCouncilToPartial(db: Db, councilId: string): Promise<void> {
  await db.update(councils).set({ status: CouncilStatusEnum.enum.partial }).where(eq(councils.id, councilId));
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
    ...councilTurnFieldsFromWizardOutput(t.take),
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
    .set({ status: CouncilStatusEnum.enum.complete, ...verdictColumns(v), completedAt: Date.now() })
    .where(eq(councils.id, councilId));
}

/** Marks status=error (stream-level catastrophic failure). */
export async function setCouncilError(db: Db, councilId: string): Promise<void> {
  await db
    .update(councils)
    .set({ status: "error", completedAt: Date.now() })
    .where(eq(councils.id, councilId));
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
