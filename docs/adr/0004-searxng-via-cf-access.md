# 0004 — SearXNG via CF Access service token for Lorekeeper's RAG

**Status:** Accepted
**Date:** 2026-05-24

## Context

Lorekeeper's cognitive technique is **RAG** — he cites real sources from a
live search of the user's question, not training-data hallucinations. The
wizard talents v1 design (see [ADR-0005](./0005-wizard-talents.md)) needs a
search backend the Worker can hit.

Search backend options:

| | Pros | Cons |
|---|---|---|
| Google Custom Search API direct | Stable, well-documented, low latency from CF, the maintainer already paid for the API key | Google-only results; loses the multi-source aggregation Lorekeeper's "footnote" personality wants |
| **SearXNG at `https://searxng.example.com`** | the maintainer's self-hosted instance; aggregates Google + DuckDuckGo + Startpage + Wikipedia + StackOverflow + GitHub; eats own dog food | Behind Cloudflare Access — Worker can't reach without auth |
| Brave Search API | Decent quality, free tier | New vendor relationship; one engine |
| Tavily, Serper, etc. | "AI search" branding, structured results | New vendor; usually pay-per-call |

The multi-engine aggregation matters specifically because Lorekeeper's
identity is "of Footnotes" — Wikipedia and StackOverflow as direct engines
give him much better citation pools than Google alone.

## Decision

Use **SearXNG at `searxng.example.com`** as the search backend. To get past
the Cloudflare Access wall, mint a **service token** for the Worker:

1. Create a CF Access service token `wizardsofodd-worker` (one-time, via
   `POST /accounts/<account>/access/service_tokens`).
2. Attach an allow-policy to the existing "Home Portal" Access app (which
   covers both `<your-host>` and `searxng.example.com` via
   `self_hosted_domains`). The policy uses `decision: non_identity` and
   `include: [{service_token: {token_id: <id>}}]`.
3. Worker sends `CF-Access-Client-Id` + `CF-Access-Client-Secret` headers on
   every search call.
4. Both credentials are Worker secrets (`wrangler secret put`).

The search call itself:
- Runs ONCE before the wizard loop (not per-wizard)
- Returns top 5 results
- 3-second timeout, fully graceful: any failure (network / 4xx-5xx /
  malformed JSON / timeout) returns `[]` and Lorekeeper falls back to
  memory-based citations with explicit "my tower's library is unreachable
  today" framing
- The same results are passed to ALL wizards (see [ADR-0005](./0005-wizard-talents.md))

## Consequences

**+** Lorekeeper cites real, linkable URLs — Wikipedia, StackOverflow, etc. —
not hallucinated citations. Verified live in production.

**+** Multi-engine aggregation matches Lorekeeper's identity. Other wizards
(notably Ozzimandias's historical-pattern technique) benefit too — they
sometimes cite the same sources.

**+** Same vendor as the rest of the stack (Cloudflare for everything).

**+** Service token is rotatable independently of the API token; expires
2027-05-24, plenty of headroom.

**+** Graceful degradation tested in production — when SearXNG was first
deployed without the auth headers, the site continued working with
memory-cited Lorekeeper as designed.

**-** Depends on the maintainer's home Caddy (`<lan-ip>`) staying up. If his
home internet drops, all wizards lose access to grounded sources. Mitigation:
graceful degradation (`search()` returns `[]`; wizards proceed).

**-** Adds ~300ms of latency before the first wizard speaks (the SearXNG
round-trip).

**-** Required a non-obvious workaround for policy creation: the new CF API's
`POST /access/policies` endpoint needed a scope our token didn't have, but
`PUT /access/apps/<id>` with an embedded `policies` array worked under
`Access:Apps:Edit` scope. Captured in code; not a recurring problem.

## Rotation procedure

See [runbook.md](../runbook.md) "Rotate keys." Service token rotation doesn't
require changing the policy on the Access app — the policy points at the
token's id, which is stable across credential refresh.
