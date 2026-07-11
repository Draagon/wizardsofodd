# 0008 — Cost defenses: Turnstile + prompt caching + IP rate limit + tighter caps

**Status:** Accepted
**Date:** 2026-05-25

## Context

Phase 1 shipped with three defenses: cookie-keyed per-visitor cap,
KV-backed global daily cap, and a manual `KILL_SWITCH` env var. At Sonnet
4.6 pricing the global cap pinned worst-case daily LLM spend at ~$150/day
— acceptable as a circuit breaker, terrible as a target. And the
per-visitor cap was trivially bypassable: a scripted attacker rotating
cookies could exhaust the global cap in minutes.

The site is live and public. The exposure was concrete; the fix had to
be layered (any single defense bypassable but the combination not).

## Decision

Five layered defenses, four in code + one out-of-band:

1. **Cloudflare Turnstile** in front of the form. Worker validates the
   token via CF's siteverify endpoint before any LLM call. Fails closed.
   Test-bypass via magic secret value (`TEST_BYPASS_TURNSTILE`) for
   dev/CI. CI grep guards prod against shipping with the bypass active.

2. **Anthropic prompt caching** (`cache_control: { type: "ephemeral" }`)
   on each wizard's static system prompt. The technique-loaded prompt
   dominates per-wizard input cost; caching it would cut ~65% on warm-
   cache calls. Verdict stays uncached (varies per council).

   **Caveat (2026-05-25):** current wizard prompts measure ~330-420
   tokens each, BELOW Anthropic's 1024-token minimum for cacheable
   Sonnet system blocks. The annotation is silently ignored today; the
   infrastructure activates automatically when prompts grow above
   threshold (expected during Phase B template prompt work).

3. **IP-based daily rate limit** as a sibling to the cookie-based limit.
   KV-backed counter, key = `rl:i:${day}:${sha256(ip).slice(0,16)}`,
   24h TTL. Raw IP never stored (ADR-0007 anonymous-first preserved).
   Fail-OPEN on missing `cf-connecting-ip` header (losing the header
   would block 100% of traffic).

4. **Tightened defaults** in `wrangler.jsonc`:
   - `MAX_QUESTIONS_PER_DAY`: 20 → 5
   - `GLOBAL_MAX_PER_DAY`: 2000 → 200
   - `IP_MAX_PER_DAY`: 10 (new)

5. **Anthropic console monthly budget cap** at $20 (out-of-band, set in
   Anthropic dashboard). Independent of any Worker code path — absorbs
   even total code-side failure.

## Consequences

**+** Worst-case daily LLM spend: $15/day theoretical ceiling today
(no effective caching), $5/day target once caching activates,
$20/month absolute (console cap). 10× reduction in exposure even
in the worst case.

**+** Scripted attacks defeated cheaply (Turnstile rejects before any
LLM call). Brute-force gets diminishing returns: the more they try, the
more cache hits we get on the wizard prompts → cheaper each call (once
prompts cross threshold).

**+** No measurable UX impact: Turnstile is invisible for most humans;
5 questions/visitor/day exceeds typical use; 10/IP/day survives normal
multi-person households on the same NAT.

**+** Privacy preserved: hashed IPs (16-hex SHA-256, 24h TTL).
ADR-0007's anonymous-first stance intact.

**+** Reversible: every cap is a `wrangler.jsonc` var; loosening is
a one-line change.

**-** Turnstile is another vendor surface that can break. CF is already
our edge, so blast radius is bounded.

**-** New env shape: `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET`,
`IP_MAX_PER_DAY`. One-time setup per environment, documented in runbook.

**-** Per-wizard system prompt is sent as a 1-element block array
instead of a string. Backward-compatible at the type level; non-trivial
orchestrator change. Covered by tests.

**-** Anthropic prompt-caching is model-version-coupled. Future
model-bumps must verify caching still works on the target model.

**-** Today, prompt caching delivers zero savings (sub-threshold).
Infrastructure investment now pays off once prompts grow.

## Alternatives we ruled out

- **hCaptcha / reCAPTCHA** — Turnstile is free, privacy-respecting, and
  in-network. No second vendor needed.
- **Edge firewall rule** (block by IP at CF) — loses observability;
  Worker-side gives uniform error messages and easy threshold tuning.
- **Replace cookie limit with IP-only** — multi-person households on NAT
  would be punished. Keep both.
- **Automated spend-monitor + auto-killswitch** — Anthropic console hard
  cap covers it for ~2 min of work vs ~1 hour of Cron + Admin API code.
- **Expand wizard prompts now to activate caching** — would be prompt
  engineering work outside the cost-defense scope. Deferred to Phase B
  when template prompts naturally cross the threshold.
