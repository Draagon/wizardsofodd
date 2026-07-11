# 0006 — 4-point calibrated verdict synthesis

**Status:** Accepted
**Date:** 2026-05-24

## Context

Phase 1 shipped a verdict prompt that said roughly: "reconcile where they
agree, state disagreement plainly." That worked but was *soft* — the model
would usually produce a vaguely-positive synthesis with "they mostly agreed"
hand-waves and rarely surface the actual interesting disagreements.

The research informing [ADR-0005](./0005-wizard-talents.md) was clear that
**calibrated uncertainty is the most underused high-leverage technique** —
models are systematically overconfident, and surfacing "here's what's
genuinely uncertain" is high-value information that gets washed out by
default synthesis prompts.

## Decision

The verdict system prompt uses an **explicit 4-move structure** the Clerk must
follow:

1. **Convergence** — what do they all say (or imply) regardless of style?
   State it plainly.
2. **Real disagreements** — name SPECIFIC places where wizards genuinely
   disagree on substance (not style). If they substantively agree, say so
   explicitly.
3. **Relevance weighting** — for THIS question's domain, whose lens is most
   relevant? Note in one short line.
4. **Calibrated confidence** — end with exactly two lines:
   ```
   High confidence: <the converged point>
   Open question: <the real disagreement, or "no significant disagreement">
   ```

200-word soft cap. "Plain, clear voice — you are the calm one in a room of
eccentrics."

## Consequences

**+** The verdict now genuinely *adds* signal over a single Claude call.
Visitors can scan the two closing lines and immediately know "here's what's
trustworthy" vs "here's what's still in play."

**+** Surfaces real disagreements instead of papering over them. In live
testing, the verdict correctly flagged subtleties like "Grumbel frames the
South Sea Company primarily as a failed trade venture; Lorekeeper and Pib
correctly note it was actually a debt-conversion scheme."

**+** Relevance weighting is an emergent feature: the verdict has been
observed to explicitly say things like "For historical accuracy, the
Lorekeeper's sourced, structural account carries most weight here" — the
Clerk noticed who had real evidence vs vibes and weighted accordingly.
That wasn't programmed; it fell out of point 3 + the wizards' technique
diversity.

**+** No SSE event-shape change — same verdict event, same client code.

**-** Verdicts are now slightly longer (~150-180 words vs ~100 before). Cards
render fine.

**-** The explicit `High confidence:` / `Open question:` lines feel formal.
Acceptable trade for the calibration value. If a future redesign wants a less
formal close, this would be the place to revisit.

## Alternatives we ruled out

- **Multi-stage refine** (verdict → critique → re-verdict) — research-warned
  trap; self-critique without an external signal doesn't reliably improve.
- **Debate-then-judge** — research showed the diversity already comes from
  the 5 wizards' technique variation; the debate layer doesn't add much.
- **Asking the LLM to "show its work"** — Claude already thinks internally;
  adding explicit reasoning chains often reduces accuracy.
