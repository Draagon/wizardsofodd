import { and, eq, inArray } from "drizzle-orm";
import { schema, type Db } from "./client";
import { newSlug } from "./slug";
import type { WizardFramePayload } from "./generated/WizardFramePayload";
import type { ErrorFramePayload } from "./generated/ErrorFramePayload";
import type { VerdictOutput } from "./generated/VerdictOutput";
// Reads are generated (findCouncilWithTurns in ./generated/Council.queries, from
// Council's `turns` composition). The bespoke writes below stay hand-written,
// but OVER the generated Drizzle tables, enum constants and lineage mappers: no
// raw SQL, and no column name or enum value spelled by hand.
import { CouncilStatusEnum } from "./generated/Council";
import { CouncilTurnInsertSchema, CouncilTurnKindEnum, WizardStanceEnum } from "./generated/CouncilTurn";
import { councilTurnFieldsFromWizardOutput } from "./generated/CouncilTurn.lineage";
import { councilFieldsFromVerdictOutput } from "./generated/Council.lineage";

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

/**
 * The lifecycle is pending -> partial -> complete | error, and complete and error
 * are final. Every status write is conditional on the council still being open,
 * so a late write can never move a finished council back (a turn recorded after
 * the verdict) or overwrite it (an error raised after the verdict was stored).
 */
const OPEN_STATUSES = [CouncilStatusEnum.enum.pending, CouncilStatusEnum.enum.partial];

/** Matches the council only while it is still open. */
function openCouncil(councilId: string) {
  return and(eq(councils.id, councilId), inArray(councils.status, OPEN_STATUSES));
}

/** Recording any turn advances an open council from 'pending' to 'partial'. */
async function advanceCouncilToPartial(db: Db, councilId: string): Promise<void> {
  await db.update(councils).set({ status: CouncilStatusEnum.enum.partial }).where(openCouncil(councilId));
}

/** Inserts a wizard turn (structured) and flips council.status to 'partial'. */
export async function recordWizardTurn(db: Db, councilId: string, t: RecordWizardTurnArgs): Promise<void> {
  await db.insert(councilTurns).values({
    councilId,
    ordinal: t.ordinal,
    round: 0, // vestigial column (follow-up rounds removed); see meta-council-turn.yaml
    wizardId: t.wizardId,
    wizardName: t.wizardName,
    kind: CouncilTurnKindEnum.enum.wizard,
    ...councilTurnFieldsFromWizardOutput(t.take),
  });
  await advanceCouncilToPartial(db, councilId);
}

// An error turn's summary is its reason, cut to the column's declared cap.
const SUMMARY_MAX: number = (() => {
  const max = CouncilTurnInsertSchema.shape.oneLineSummary.maxLength;
  if (max === null) throw new Error("CouncilTurn.oneLineSummary must declare a maxLength");
  return max;
})();

/** Inserts an error turn (wizard's response could not be parsed). */
export async function recordErrorTurn(db: Db, councilId: string, t: RecordErrorTurnArgs): Promise<void> {
  await db.insert(councilTurns).values({
    councilId,
    ordinal: t.ordinal,
    round: 0, // vestigial column (follow-up rounds removed); see meta-council-turn.yaml
    wizardId: t.wizardId,
    wizardName: t.wizardName,
    kind: CouncilTurnKindEnum.enum.error,
    stance: WizardStanceEnum.enum.abstains,
    takeMarkdown: t.reason,
    oneLineSummary: t.reason.slice(0, SUMMARY_MAX),
    confidence: 0,
    keyClaims: [],
    citations: null,
  });
  await advanceCouncilToPartial(db, councilId);
}

/** Marks an open council complete with the structured verdict + completion time. */
export async function finalizeCouncil(db: Db, councilId: string, v: VerdictOutput): Promise<void> {
  await db
    .update(councils)
    .set({ status: CouncilStatusEnum.enum.complete, ...councilFieldsFromVerdictOutput(v), completedAt: Date.now() })
    .where(openCouncil(councilId));
}

/** Marks an open council error (stream-level catastrophic failure). A finished council is left as it is. */
export async function setCouncilError(db: Db, councilId: string): Promise<void> {
  await db
    .update(councils)
    .set({ status: CouncilStatusEnum.enum.error, completedAt: Date.now() })
    .where(openCouncil(councilId));
}
