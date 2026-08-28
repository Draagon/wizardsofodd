import type { SystemBlock, AnthropicMessage } from "../llm/anthropic";
import type { SearchResult } from "../llm/web-search";
import { WIZARD_REGISTRY } from "../personas/generated/registry";
import { templateProvider } from "../render/template-provider";
import type { WizardUserPayload } from "../render/generated/prompts";
import type { WizardOutput } from "../db/generated/WizardOutput";
import type { VerdictOutput } from "../db/generated/VerdictOutput";
import {
  buildWizardSystem,
  buildVerdictSystem,
  buildVerdictMessages,
  fullName,
  toTurnLens,
  toSourceLens,
  type PriorTurn,
} from "./prompts";
import {
  callEmitWizardTake,
  callEmitVerdict,
  type ToolcallParams,
} from "../llm/generated/toolcalls";

export type CouncilEvent =
  | { type: "wizard"; wizardId: string; wizardName: string; take: WizardOutput }
  | { type: "error"; wizardId: string; wizardName: string; reason: string }
  | { type: "verdict"; verdict: VerdictOutput };

/** Optional per-question search. Should never throw — return [] on failure. */
export type SearchFn = (query: string) => Promise<SearchResult[]>;

export interface ConveneParams {
  question: string;
  /** Anthropic API key forwarded to `completeStructured`. */
  apiKey: string;
  /**
   * Optional registry override. Defaults to the codegen'd WIZARD_REGISTRY.
   * Tests inject subset registries (e.g. filtered by wizard id) to exercise
   * partial-council scenarios without forking the production roster.
   */
  registry?: typeof WIZARD_REGISTRY;
  /** Optional. When provided, the orchestrator pre-fetches sources ONCE and shares them with ALL wizards. */
  search?: SearchFn;
  /** Test seam — forwarded to `completeStructured`. */
  fetchImpl?: typeof fetch;
  /** Optional model override; defaults to the value baked into `completeStructured`. */
  model?: string;
}

/**
 * Project ConveneParams + (system, messages) into the ToolcallParams shape the
 * codegen'd wrappers expect. Strips undefined optionals so the spread inside
 * the wrappers stays exactOptionalPropertyTypes-clean.
 */
function toolcallParams(
  params: { apiKey: string; fetchImpl?: typeof fetch; model?: string },
  system: string | SystemBlock[],
  messages: AnthropicMessage[],
): ToolcallParams {
  const out: ToolcallParams = { apiKey: params.apiKey, system, messages };
  if (params.fetchImpl !== undefined) out.fetchImpl = params.fetchImpl;
  if (params.model !== undefined) out.model = params.model;
  return out;
}

export async function* convene(params: ConveneParams): AsyncGenerator<CouncilEvent> {
  const { question, search } = params;
  const registry = params.registry ?? WIZARD_REGISTRY;
  const all = registry.map((e) => e.wizard);
  const prior: PriorTurn[] = [];

  // Run search ONCE before the loop; share the same results with every wizard.
  // Cost-efficient: one network call, all wizards benefit. Lorekeeper's persona
  // instructions mandate citing; others may cite if their technique benefits.
  // Defensive try/catch — SearchFn should never throw, but if it does, the council
  // still proceeds with empty sources rather than failing outright.
  let sources: readonly SearchResult[] = [];
  if (search) {
    try {
      sources = await search(question);
    } catch {
      sources = [];
    }
  }

  for (const entry of registry) {
    const wizard = entry.wizard;
    const name = fullName(wizard);
    try {
      // Wrap the per-wizard system prompt as a cache_control: ephemeral block.
      // Anthropic caches by exact byte-equal content with a 5-min TTL — so within
      // any reasonable burst of traffic, every wizard prompt after the first hits
      // cache at ~10× discount.
      //
      // NOTE (2026-05-25): the current per-wizard prompts measure ~330-420 tokens,
      // BELOW Anthropic's 1024-token minimum for cacheable system blocks on Sonnet.
      // The annotation is silently ignored today; the infrastructure is in place
      // so when prompts grow (Phase B template prompts, additional Guild lore)
      // caching activates automatically. See docs/adr/0008-cost-defenses.md.
      const wizardSystem: SystemBlock[] = [
        { type: "text", text: buildWizardSystem(wizard, all), cache_control: { type: "ephemeral" } },
      ];

      // Build the user prompt via THIS wizard's renderUser handle (from the
      // registry entry). Today all wizard user templates are byte-identical, so
      // any handle would produce the same string — but routing through the
      // entry's own renderer is the architecturally honest path: adding a
      // wizard with a divergent user template requires zero orchestrator changes.
      // PriorTurn/SearchResult (internal) project to the codegen'd TurnLens/
      // SourceLens shapes via the shared boundary helpers (toTurnLens/toSourceLens),
      // so this projection stays in lock-step with the message builders in prompts.ts.
      const userPayload: WizardUserPayload = {
        visitorQuestion: question,
        prior: prior.map(toTurnLens),
        hasPrior: prior.length > 0,
        sources: sources.map(toSourceLens),
        hasSources: sources.length > 0,
      };
      const userContent = entry.renderUser(userPayload, templateProvider).trimEnd();

      const take = await callEmitWizardTake(
        toolcallParams(params, wizardSystem, [{ role: "user", content: userContent }]),
      );
      prior.push({ persona: wizard, take });
      yield { type: "wizard", wizardId: wizard.id, wizardName: name, take };
    } catch {
      yield {
        type: "error",
        wizardId: wizard.id,
        wizardName: name,
        reason: `${wizard.name} is lost in thought and does not answer.`,
      };
    }
  }

  // No wizard produced a take (e.g. the only selected wizard failed, or all of
  // them did). There is nothing for the Clerk to synthesize — calling it would
  // feed an empty take-list and invite a fabricated verdict. Emit an honest
  // "nobody answered" verdict instead, skipping the LLM round-trip.
  if (prior.length === 0) {
    yield {
      type: "verdict",
      verdict: {
        stance: "unanswerable",
        confidence: 0,
        takeMarkdown:
          "No wizard was able to answer this time, so the Guild has no verdict to offer. Please try again in a moment.",
        dissents: [],
        evidenceQuality: "none",
        agreements: [],
        splits: [],
        verifyNote: "",
      },
    };
    return;
  }

  const vSys = buildVerdictSystem(all);
  const vMsgs = buildVerdictMessages(question, prior);
  try {
    const verdict = await callEmitVerdict(toolcallParams(params, vSys, vMsgs));
    yield { type: "verdict", verdict };
  } catch {
    // A malformed verdict is absorbed by emitVerdict's canned fallback inside
    // the wrapper, so anything reaching here is a transport/API failure (rate
    // limit, overload). Surface that honestly instead of crashing the SSE
    // stream — and worded distinctly from the fallback's "could not converge"
    // deliberation outcome, since the wizards' takes above are still valid.
    yield {
      type: "verdict",
      verdict: {
        stance: "unanswerable",
        confidence: 0,
        takeMarkdown:
          "The wizards' takes are above, but the Guild hit a temporary problem before it could synthesize a verdict. Please try again in a moment.",
        dissents: [],
        evidenceQuality: "none",
        agreements: [],
        splits: [],
        verifyNote: "",
      },
    };
  }
}

// Follow-up rounds (clarify) were removed with the follow-up feature; convene
// is the single round-0 council flow.
