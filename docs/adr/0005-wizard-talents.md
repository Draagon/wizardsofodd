# 0005 — Wizard talents: per-wizard technique + shared sources

**Status:** Accepted
**Date:** 2026-05-24

## Context

Phase 1 launched with five wizards that had distinct *personalities* (Grumbel
catastrophizes, Vexil riddles, Lorekeeper footnotes everything, etc.) but
otherwise reasoned identically — they were five voices, not five reasoners.
The verdict was personality-flavored but didn't extract more signal than a
single Claude call would.

A research pass on top LLM-prompting techniques (RAG, ReAct, decomposition,
persona, self-critique, debate, pre-mortem, CoT, self-consistency, calibration)
yielded the actionable findings:

- **Persona + pre-mortem + RAG** are the highest-ROI techniques for
  advice/judgment tasks
- Self-consistency has aged badly (frontier model samples too correlated; cost
  scales linearly with diminishing return)
- Tree of Thoughts is toy-puzzle theater in production
- Multi-agent debate's gains come from **sample diversity, not the debate
  itself** — our 5-wizard council already captures most of the benefit
- Self-critique without an external signal is a trap (~30% of "self-refine"
  gains in early papers were gold-answer leakage)
- Pre-mortem is the highest-ROI underused technique for advice

The clean mapping fell out naturally — each wizard's existing personality
suggested an obvious technique fit.

## Decision

Each persona gains a structured `technique: { name, instructions }` field that
gets interpolated into the system prompt by `buildWizardSystem`. The
personality stays 100% intact; the technique is a *layer* on top.

| Wizard | Technique | What changes |
|---|---|---|
| **Grumbel the Overcaffeinated** | **pre-mortem** | "Assume your recommendation goes wrong. Name the SPECIFIC failure mode. Then grudgingly give the recommendation." His catastrophizing now serves the technique. |
| **Madame Vexil the Riddling** | **inversion** | "Answer the INVERSE of the question — what would make the OPPOSITE outcome happen." Her riddles become structured Munger-style inversion. |
| **The Lorekeeper of Footnotes** | **RAG** | "Cite the provided sources by title and URL inline." Real web search via [ADR-0004](./0004-searxng-via-cf-access.md). |
| **Ozzimandias the Inevitable** | **historical-pattern** | "Name a specific historical or literary parallel. Place the user in that arc." His doom is now anchored to real patterns. |
| **Pib the Smol** | **decomposition + calibrated uncertainty** | "Identify ambiguous terms. Pick one interpretation explicitly. End with explicit confidence." His literalism is now structural rigor. |

The search call (Lorekeeper's tool) runs **once before the wizard loop** and
the same `SearchResult[]` is passed to **every** wizard's
`buildWizardMessages` call. Lorekeeper's persona instructions mandate that he
cite; the others *may* cite if their technique benefits — in practice
Ozzimandias frequently does (real historical cases), and Grumbel sometimes
does (named failure modes from the literature). The point: one network call,
multi-wizard benefit.

## Consequences

**+** The council is now meaningfully smarter than a single Claude call. The
verdict surfaces real disagreements between different reasoning approaches,
not just stylistic variation between voices.

**+** Cost-efficient: one search call serves all five wizards. Per-council
cost increase vs Phase 1 is ~300ms latency + the search call itself
(SearXNG → Google CSE which the maintainer already pays for).

**+** Each wizard's identity is now *visible in their replies* through
structure, not just voice. Grumbel explicitly names a failure case before
recommending. Pib explicitly states confidence. The thinking is on-screen.

**+** Honest in degraded mode — when search fails, Lorekeeper says so in
character ("my library is unreachable today") and falls back to
memory-based citations with explicit uncertainty framing. The product
behaves the same; only Lorekeeper's grounding changes.

**+** No SSE event-shape change — the frontend (`public/app.js`) didn't
touch. Backward-compatible.

**-** Per-wizard system prompt is now ~3x longer (technique instructions add
~300 tokens per wizard). Anthropic's prompt-caching makes this mostly free
on warm-cache requests, but every cold call pays full freight.

**-** Replies are 2-5 sentences instead of the prior 2-4 (techniques need a
touch more breathing room). Minor; cards render fine.

**-** The "different art traditions per wizard" portrait concept didn't
fully land alongside the technique work — Vexil and Lorekeeper came out as
generic oils rather than engraving / illuminated manuscript. We accepted
"painted gallery, cohesive" over "wildly varied traditions" once it became
clear SDXL doesn't reliably do those specific styles.

## Alternatives we ruled out

- **Self-consistency (sample N times, vote)** — research-confirmed overhyped
  for frontier models. Skipped.
- **Tree-of-Thoughts per wizard** — toy-puzzle theater. Skipped.
- **Explicit "think step-by-step" CoT** — Claude already thinks internally;
  adding explicit CoT can *reduce* accuracy. Skipped.
- **Debate-style consensus mechanism** — research shows the gains come from
  sample diversity, which our 5 wizards already provide. The verdict (see
  [ADR-0006](./0006-verdict-synthesis.md)) does the synthesis without needing
  a separate debate phase.
- **Tool use for all 5 wizards (full ReAct)** — too much scope for v1; defer
  to Phase 4 alongside Draagon. Lorekeeper's pre-fetched search is the v1
  "tool" abstraction.
