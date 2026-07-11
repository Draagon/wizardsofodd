# Architecture

System overview and request flows. For the *why* behind each decision, see
[`adr/`](./adr/); for how the MetaObjects spine drives the code, see
[how-metaobjects-is-used.md](./how-metaobjects-is-used.md).

## One Worker, three surfaces

A single Cloudflare Worker handles everything:

```
        ┌──────────────────────────────────────────────────────────┐
        │                  wizardsofodd.com                        │
        │              (Cloudflare Worker: wizardsofodd)           │
        ├──────────────────────────────────────────────────────────┤
        │                                                          │
        │   ┌─────────────────┐    ┌──────────────────────────┐    │
        │   │ Static assets   │    │  Hono app (src/index.ts) │    │
        │   │ (Vite build +   │    │                          │    │
        │   │  public/)       │    │  GET  /api/health        │    │
        │   │ • index.html    │    │  POST /api/council  (SSE)│    │
        │   │ • SPA bundle    │    │  GET  /c/:slug  (SSR)    │    │
        │   │ • styles.css    │    │  GET  /c/:slug.json      │    │
        │   │ • portraits/    │    │                          │    │
        │   └─────────────────┘    └──────────────────────────┘    │
        │           ▲                          │                   │
        │           │                          ▼                   │
        │   ┌─ run_worker_first ──────────────────────────────┐    │
        │   │  Routes /api/* and /c/* to the Worker first;    │    │
        │   │  everything else served as static; unknown      │    │
        │   │  paths fall back to index.html (SPA mode).      │    │
        │   └────────────────────────────────────────────────┘    │
        │                                                          │
        │     Bindings:                                            │
        │       ASSETS      Fetcher    (static-asset binding)      │
        │       RATE_LIMIT  KVNamespace                            │
        │       DB          D1Database  (councils + council_turns) │
        │     Vars:                                                │
        │       MODEL, MAX_QUESTIONS_PER_DAY, GLOBAL_MAX_PER_DAY,  │
        │       KILL_SWITCH, SEARCH_URL                            │
        │     Secrets:                                             │
        │       ANTHROPIC_API_KEY                                  │
        │       CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET       │
        │                                                          │
        └─────────────────────┬────────────────────────────────────┘
                              │
                              │ (one search call before the wizard loop)
                              ▼
                  ┌───────────────────────┐
                  │ searxng.example.com    │
                  │ (SearXNG via CF       │
                  │  Access service       │
                  │  token)               │
                  └───────────────────────┘
                              │
                              ▼  (1 LLM call per selected wizard + 1 verdict)
                  ┌───────────────────────┐
                  │ Anthropic Messages API │
                  └───────────────────────┘
```

## Request flow: POST /api/council

1. **Validate** — empty/whitespace question → 400. `length > 600` → 400.
2. **Identify visitor** — read `woo_vid` cookie; mint a new one (`crypto.randomUUID()`)
   if absent. The cookie is set on both the 429 response AND the streaming 200
   `Response` so it round-trips even on errors.
3. **Rate limit** — `RATE_LIMIT` KV: per-visitor daily counter + global daily
   counter, plus a global kill-switch var. Blocked → 429 with an in-character
   message keyed by reason.
4. **Begin SSE stream** — `text/event-stream`, no cache.
5. **Search ONCE** — pre-fetch `SearchResult[]` from `searxng.example.com` (with
   CF Access service-token headers). Three-second timeout; failure returns `[]`
   gracefully. See [ADR-0004](./adr/0004-searxng-via-cf-access.md).
6. **Wizard loop (one iteration per selected wizard — 5 by default of a 10-persona roster)** — for each persona:
   - Build system prompt (`buildWizardSystem`): identity + voice rules +
     bickers-with + the wizard's structured cognitive technique block + refusal
     style.
   - Build user message (`buildWizardMessages`): the question + each prior
     wizard's reply (so wizards can react to each other) + the shared sources
     block (so any wizard can cite real URLs, not just Lorekeeper).
   - Call `complete()` against Anthropic. Per-wizard try/catch: on success,
     emit `event: wizard` SSE frame and push the turn into `prior`; on throw,
     emit `event: error` with an in-character "lost in thought" message and
     skip pushing.
7. **Verdict synthesis** — `buildVerdictSystem` instructs the Clerk to follow a
   4-point structure: **Convergence → Real disagreements → Relevance weighting →
   Calibrated confidence** (with explicit `High confidence: <x>` / `Open
   question: <y>` closing lines). On throw, emit a graceful fallback verdict.
8. **Close** — emit `event: done`, close the stream.

As the stream proceeds, the orchestrator writes an `insertCouncil` row, then
`recordWizardTurn` per wizard, and `finalizeCouncil` after the verdict — all
into D1 via Drizzle. The opening SSE frame carries the freshly minted slug so
the client can render a "Share this council" affordance from turn 1.

## Request flow: GET /c/:slug

Pure-SSR React. The Worker reads `councils` + `council_turns` from D1, hands
them to `renderShareSync` (a React 18 server render to string), and returns
HTML with no client hydration. Same `WizardCard` / `VerdictCard` components
the live SPA uses, so the offline-share view stays byte-identical to the
streaming one. `GET /c/:slug.json` exposes the same data as JSON for tooling.

## Request flow: GET / and GET /api/health

`/` serves the Vite-built SPA shell from static assets. Health endpoint is
trivial; no state.

## Frontend (src/web/)

React 18 SPA, Vite-bundled, no framework router (just route-on-URL in
`App.tsx`):

- `useCouncilStream` hook reads SSE frames from `POST /api/council`, parses
  them via `parseSseStream` (handles partial frames buffered across chunk
  boundaries, skips unparseable frames without aborting), and reduces a
  council state machine.
- `WizardCard` and `VerdictCard` render the structured payload directly
  from the codegen'd `WizardOutput` / `VerdictOutput` types — `renderMarkdownLite`
  escape-then-render still handles wizard prose (no XSS surface).
- A "Meet the Guild" preview shows all 10 wizards before the first submit;
  hidden after submit so the live council takes over.
- Same components mount in `src/render/share-page.tsx` for SSR `/c/:slug`.

## Persona model

Each `Wizard` (codegen'd into `src/db/generated/Wizard.ts` from
`data/wizards/*.yaml` via the MO `entityFile` generator + the `source.rdb`
value-only path) has:
- Identity: `id`, `name`, `title`, `domain`
- Personality: `quirk`, `voiceRules`, `refusalStyle`, `bickersWith[]`
- **Cognitive technique** (`techniqueName`, `techniqueInstructions`) — a
  structured block injected into the system prompt that gives each wizard a
  real reasoning approach (pre-mortem / inversion / RAG / historical-pattern /
  decomposition+calibration). See [ADR-0005](./adr/0005-wizard-talents.md).
- `WIZARD_REGISTRY` (`src/personas/generated/registry.ts`) pairs each wizard
  with its per-wizard prompt-render handle, emitted by the custom
  `wizardRegistry` generator at `src/codegen/wizard-registry-generator.ts`.
  See `docs/runbook.md` § "Adding a wizard" for the 5-file recipe.

## Search architecture (Lorekeeper's RAG)

A single search runs *before* the wizard loop. The same `SearchResult[]` is
passed to every wizard's `buildWizardMessages` call. Lorekeeper's persona
instructions mandate that he cite the sources by URL; other wizards may cite
if their technique benefits (and frequently do — e.g., Ozzimandias names real
historical parallels). See [ADR-0004](./adr/0004-searxng-via-cf-access.md).

## Graceful degradation

| Failure | Behaviour |
|---|---|
| Anthropic API call for one wizard fails | That wizard emits an in-character error event; council continues; verdict still attempted |
| Verdict call fails | Generic "the wizards wandered off to argue" fallback verdict |
| Search call fails / times out | Empty `SearchResult[]` returned; wizards proceed; Lorekeeper's prompt lampshades "my tower's library is unreachable today" |
| Rate limit triggered | 429 with in-character message; no DB write, no LLM call |

## Out of scope (current cut)

- User accounts / login
- Per-question generated images (Phase 3 — designed, not built)
- Real per-visitor memory across visits (Phase 4 — needs Draagon)
- Inter-wizard belief reconciliation beyond what the verdict captures (Phase 4)
