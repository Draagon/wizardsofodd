# 0001 — Cloudflare Workers + Static Assets as the whole stack

**Status:** Accepted
**Date:** 2026-05-23

## Context

`wizardsofodd.com` needed a runtime that could serve a small static site, run
a long-lived SSE endpoint (the streaming council), and (eventually) host
persistent state for shareable URLs. Realistic options:

| Option | Pros | Cons |
|---|---|---|
| Cloudflare Workers + Static Assets | Single deploy; edge-global; free tier easily covers a toy; KV/D1 first-class bindings; SSE works | New-ish "Static Assets" model; some tooling immaturity |
| Cloudflare Pages + Functions | More established; same edge model | Two deploy surfaces (Pages + Functions); awkward for the always-on SSE endpoint |
| Railway (Node + Fastify + Postgres) | Familiar Node/Fastify/Postgres stack | $5+/mo minimum; needs a host to pay for; another dashboard to manage |
| Hostinger Web Hosting | Already paid for (a sibling project) | Shared PHP host; Node via SSH is second-class; the plan was to *exit* Hostinger as part of CF consolidation |

the maintainer's existing infrastructure was already heavily Cloudflare (Caddy DNS-01
challenges via CF token, multiple zones, Pages sites for sister projects). The
[Cloudflare-consolidation runbook](../../) in `~/claude/notes/` explicitly
plans to exit GoDaddy and Hostinger.

## Decision

Use a single Cloudflare Worker with the [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
binding to serve everything:

- `public/` is served as static assets via the `ASSETS` binding
- A Hono app handles `/api/*` routes (council endpoint, health)
- `not_found_handling: "single-page-application"` falls unknown paths back to
  `index.html`
- `run_worker_first: ["/api/*", "/c/*"]` ensures API and (Phase-2) share routes
  hit the Worker before the SPA fallback intercepts them
- Custom domain `wizardsofodd.com` + `www.wizardsofodd.com` bound to the Worker
- Bindings: `RATE_LIMIT` (KV) for rate limits, `DB` (D1) for persistence
  (Phase 2), `ASSETS` (Fetcher) for static.
- Vars + secrets for API keys.

No Railway. No Hostinger. No separate Pages site. One deploy: `wrangler deploy`.

## Consequences

**+** Zero infrastructure to manage beyond the Worker itself. No servers, no
container registry, no database admin, no TLS cert renewal.

**+** Free tier covers vastly more than a toy will ever need (100k requests/
day on the free plan; we are nowhere near).

**+** Same vendor as everything else in the maintainer's stack — no new dashboard, no
new billing relationship, no new failure mode.

**+** Phase 2 persistence (D1) drops in as another binding on the same
Worker — no new deploy surface.

**+** Aligns with the Cloudflare-consolidation plan.

**-** Workers have a 50ms CPU limit per request on the free tier (10ms after
the initial sub-request); the SSE endpoint stays well under this because most
time is awaiting external APIs (Anthropic, SearXNG), not CPU.

**-** D1 has best-effort write semantics under concurrency (non-atomic RMW).
For our toy's rate limits and council writes, this is acceptable; would be
problematic for higher-stakes mutations.

**-** `wrangler.jsonc`'s `run_worker_first` had to be added once the SPA
fallback model started intercepting our routes. Easy to miss; documented in
[runbook.md](../runbook.md) "Common gotchas."

**-** The Static Assets model is newer; some quirks (which we've documented
in CLAUDE.md and the runbook).
