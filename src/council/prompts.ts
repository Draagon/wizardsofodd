// Thin facades over the codegen'd render handles. The prose that used to live
// in this file (per-wizard system text, verdict scaffold, source formatting)
// now lives in data/templates/**/*.mustache, with the templates compiled into
// src/render/generated/templates.ts at build time. This module preserves the
// historical positional signatures so call sites and the byte-equivalence
// snapshot test do not need to change.
import {
  renderVerdictSystem,
  renderVerdictUser,
  type WizardSystemPayload,
  type WizardUserPayload,
  type VerdictSystemPayload,
  type VerdictUserPayload,
} from "../render/generated/prompts";
import { templateProvider } from "../render/template-provider";
import { WIZARD_REGISTRY } from "../personas/generated/registry";
import type { Wizard } from "../db/generated/Wizard";
import type { WizardOutput } from "../db/generated/WizardOutput";
import type { TurnLens } from "../db/generated/TurnLens";
import type { SourceLens } from "../db/generated/SourceLens";
import type { AnthropicMessage } from "../llm/anthropic";
import type { SearchResult } from "../llm/web-search";

export interface PriorTurn {
  persona: Wizard;
  take: WizardOutput;
}

export function fullName(p: Wizard): string {
  return `${p.name} ${p.title}`.trim();
}

// Projection-boundary helpers: PriorTurn/SearchResult (internal shapes) → the
// codegen'd TurnLens/SourceLens the user templates consume. Shared by the
// orchestrator and the message builders so the two projections can't drift
// (the snippet truncation in particular must stay in lock-step).

/** Project one prior wizard turn into the TurnLens shape shown to later wizards + the Clerk. */
export function toTurnLens(t: PriorTurn): TurnLens {
  return {
    wizardId: t.persona.id,
    wizardName: fullName(t.persona),
    stance: t.take.stance,
    takeMarkdown: t.take.takeMarkdown,
    oneLineSummary: t.take.oneLineSummary,
    confidence: t.take.confidence,
  };
}

/** Project a search hit into SourceLens. Snippet is truncated to 300 chars to
 *  preserve the pre-Phase-F prompt byte-equivalence (SearXNG snippets run >1k). */
export function toSourceLens(s: SearchResult): SourceLens {
  return { title: s.title, url: s.url, snippet: s.content.slice(0, 300) };
}

function entryFor(wizard: Wizard) {
  const e = WIZARD_REGISTRY.find((x) => x.wizard.id === wizard.id);
  if (!e) throw new Error(`No registry entry for wizard ${wizard.id}`);
  return e;
}

function rivalNamesOf(wizard: Wizard, all: readonly Wizard[]): string[] {
  const bickersWith = (wizard.bickersWith ?? []) as readonly string[];
  return bickersWith
    .map((id) => all.find((w) => w.id === id)?.name)
    .filter((n): n is string => Boolean(n));
}

export function buildWizardSystem(wizard: Wizard, all: readonly Wizard[]): string {
  const turnNumber = all.findIndex((w) => w.id === wizard.id) + 1;
  const rivalNames = rivalNamesOf(wizard, all);
  // Project the rival list into RivalLens rows (name + a `last` flag). The
  // system template does its own ", " joining via {{^last}}, {{/last}} in the
  // shared wizards/bicker partial, so the separator prose lives in the template
  // (visible to `meta verify`), never in a code-side .join(", ").
  const payload: WizardSystemPayload = {
    hasRivals: rivalNames.length > 0,
    rivals: rivalNames.map((name, i) => ({ name, last: i === rivalNames.length - 1 })),
    turnNumber,
  };
  // Mustache may produce trailing whitespace from section iteration; today's
  // hand-rolled join produced none. trimEnd() guarantees byte-equivalence.
  return entryFor(wizard).renderSystem(payload, templateProvider).trimEnd();
}

/** @internal — kept for byte-equivalence snapshot test (`test/prompts-snapshot.test.ts`). */
export function buildWizardMessages(
  question: string,
  prior: PriorTurn[],
  sources: readonly SearchResult[] = [],
): AnthropicMessage[] {
  // All wizard user templates are byte-identical (the per-wizard
  // variation is system-side); any renderer produces the same output.
  // Pick the first registry entry by convention.
  const payload: WizardUserPayload = {
    question,
    prior: prior.map(toTurnLens),
    hasPrior: prior.length > 0,
    sources: sources.map(toSourceLens),
    hasSources: sources.length > 0,
  };
  const content = WIZARD_REGISTRY[0].renderUser(payload, templateProvider).trimEnd();
  return [{ role: "user", content }];
}

export function buildVerdictSystem(all: readonly Wizard[]): string {
  // Project the guild into RosterLens rows (fullName + a `last` flag); the
  // verdict system template joins them with ", " itself via {{^last}}, {{/last}},
  // so the separator prose lives in the template, not a code-side .join(", ").
  const payload: VerdictSystemPayload = {
    roster: all.map((p, i) => ({ fullName: fullName(p), last: i === all.length - 1 })),
  };
  return renderVerdictSystem(payload, templateProvider).trimEnd();
}

/** `prior` is expected non-empty: the orchestrator calls this only after every wizard has spoken. */
export function buildVerdictMessages(question: string, prior: PriorTurn[]): AnthropicMessage[] {
  const payload: VerdictUserPayload = {
    question,
    prior: prior.map(toTurnLens),
  };
  const content = renderVerdictUser(payload, templateProvider).trimEnd();
  return [{ role: "user", content }];
}
