# Claude Context — wizardsofodd.com

Entry point for coding-agent sessions. Skim it before working in this repo, then
read [`.metaobjects/AGENTS.md`](.metaobjects/AGENTS.md) (imported below) for the
MetaObjects working rules.

## What this is

**The Wizards of Odd** — a live public app at https://wizardsofodd.com: a council of
ten eccentric AI wizard personas (five run by default; the visitor can enable any
subset) answers a question via Anthropic tool-calls, then a Clerk delivers a verdict,
streamed over SSE. It's also a **reference implementation of MetaObjects** — one typed
metadata spine drives the DB schema, the API types, the LLM prompts, and the SSE
protocol, with a build-time drift gate. See [`README.md`](README.md) and
[`docs/how-metaobjects-is-used.md`](docs/how-metaobjects-is-used.md).

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | **Cloudflare Workers** (one Worker serves static assets + `/api/*`) |
| Framework | [Hono](https://hono.dev/) |
| Frontend | React 18 SPA (Vite) for the home route; pure-SSR React for `/c/:slug` share routes |
| LLM | Anthropic Claude API (`claude-sonnet-4-6` by default) |
| Persistence | Cloudflare D1 + Drizzle, schema + queries driven by MetaObjects codegen (ADR-0002) |
| Rate limit / bot gate | Workers KV + Cloudflare Turnstile |
| Search (optional, Lorekeeper's RAG) | a self-hosted SearXNG behind Cloudflare Access, via the `SEARCH_URL` secret; degrades gracefully if unset |
| Metadata / codegen | `@metaobjectsdev/*@0.15.18` — loader, `meta gen` (codegen), `meta verify` (drift gate) |
| Tests | Vitest via `@cloudflare/vitest-pool-workers` + jsdom |

## Layout

```
metaobjects/          the metadata SPINE (typed, durable)
  meta-*.yaml           entities (Council, CouncilTurn) + value-objects (WizardOutput, payloads, …)
  abstracts/            shared abstract fields (shortSlug, the stance enums)
  prompts/              template.prompt declarations (meta-prompts-{wizards,verdict}.yaml)
  toolcalls/            template.toolcall declarations
  sse-frames/           template.streamFrame (a PROJECT-LOCAL subtype) + payload value-objects
data/                 instance data OUTSIDE the spine (loadMemory() treats metaobjects/ as metadata)
  wizards/*.yaml         the 10 wizard personas
  templates/            external Mustache prompt text (wizards/, verdict/)
codegen/generators/   OWNED entity/queries/barrel generators (ADR-0034 scaffold-and-own)
src/
  index.ts              Hono Worker: council SSE endpoint, Env, Turnstile + rate-limit gates
  council/              orchestrator.ts (convene) · prompts.ts (compose generated handles)
  codegen/              custom generators (sse-frames, structured-completion, wizard-registry,
                        wizard-data, mustache-templates) + wizardsofodd-provider.ts
  db/                   D1 + Drizzle: client.ts, queries.ts, slug.ts, generated/
  llm/                  anthropic.ts, web-search.ts, generated/toolcalls.ts
  render/               template-provider.ts, share-page.tsx (SSR), generated/{prompts,templates}.ts
  personas/generated/   wizards.ts + registry.ts (generated)
  web/                  React 18 SPA — components/, hooks/, lib/
  middleware/           rateLimit.ts, turnstile.ts
src/**/generated/     GENERATED code — drift-gated, never hand-edited
scripts/              generate-assets.ts (local ComfyUI, one-off), generate-favicons.ts, verify-portraits.ts
docs/                 architecture.md, how-metaobjects-is-used.md, adr/, runbook.md
.claude/ .metaobjects/  the shipped agent-context (skills + AGENTS.md)
migrations/           D1 migrations (hand-written SQL; schema is authored, not diffed here)
wrangler.jsonc  vite.config.ts  metaobjects.config.ts
```

## Common commands

```bash
npm install
npm run gen:db          # meta gen — regenerate all generated code from the spine
npm run demo:drift      # meta verify --templates --codegen — THE DRIFT GATE (must be green)
npm run check           # gen:db → verify → tsc → vitest
npm run dev             # wrangler dev (needs .dev.vars with ANTHROPIC_API_KEY)
npm run build:web       # build the React SPA into public/
npm run deploy          # wrangler deploy
```

See [`docs/runbook.md`](docs/runbook.md) for deploy / regen / rotate / smoke-test procedures.

## Conventions (the load-bearing ones)

- **Metadata is the spine.** To change the model, edit `metaobjects/` and run `npm run gen:db`;
  never hand-edit `src/**/generated/`. `npm run demo:drift` (and CI) must stay green.
- **Named constants for metamodel strings** — import type/subtype/attr names from
  `@metaobjectsdev/metadata`; never inline `"template"`/`"toolcall"`/etc. (see `src/codegen/`).
- **Resolving accessors, not own** (ADR-0039) — use `children()`/`attr()`, not `ownChildren()`/
  `ownAttr()`, unless a comment names the sanctioned own-only case.
- **Strict provenance** (ADR-0023) — every metadata attr must come from a registered provider;
  add project-local vocabulary in `src/codegen/wizardsofodd-provider.ts`, not ad-hoc.
- **TDD** — write the failing test first. The Vitest suite must stay green. No watch processes.
- **No `any`** — use `unknown` and narrow.
- Commit messages end with the `Co-Authored-By: Claude …` trailer.

## Pointers

1. [`README.md`](README.md) — what this is + the money shot.
2. [`docs/how-metaobjects-is-used.md`](docs/how-metaobjects-is-used.md) — the metadata tour + friction log.
3. [`docs/architecture.md`](docs/architecture.md) — request flow + contracts.
4. [`docs/adr/`](docs/adr/) — why each consequential decision was made.
5. Upstream: [metaobjects.dev](https://metaobjects.dev).

@.metaobjects/AGENTS.md
