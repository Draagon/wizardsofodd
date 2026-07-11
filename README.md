# The Wizards of Odd

A live AI app where **renaming one YAML field fails the database schema, the API
types, and the LLM prompts — in CI.**

**[Play it live → wizardsofodd.com](https://wizardsofodd.com)** · a "council" of ten
eccentric wizard personas answers your question via Anthropic tool-calls, argues,
and a Clerk delivers a verdict — streamed over SSE. ("Wizards of *Odd*" = weird, not
gambling odds.)

It's also a **reference implementation of [MetaObjects](https://metaobjects.dev)** —
a real, deployed adopter, open so you can see the pattern used in anger instead of a
quickstart. One typed-metadata spine drives every generated surface, and a drift gate
keeps them from silently diverging.

---

## Why this repo exists

MetaObjects treats **typed metadata as the durable spine** and generated code as the
disposable artifact. This app is a working proof: **one spine → many outputs, one gate.**

| Metadata (`metaobjects/`, `data/`) | Generator | Generated artifact | Consumed by |
|---|---|---|---|
| `object.entity` (Council, CouncilTurn) — `source.rdb`, identity, `field.enum`, `field.object` | `entityFile` / `queriesFile` | Drizzle D1 tables + Zod + typed finders (`src/db/generated/`) | `src/db/queries.ts` |
| `object.value` payloads + `template.prompt` | `promptRender` | typed render handles (`src/render/generated/prompts.ts`) | `src/council/prompts.ts` |
| Mustache text (`data/templates/`) | `mustacheTemplates` (custom) | inlined template map (`.../templates.ts`) | the render provider |
| `template.toolcall` | `structuredCompletion` (custom) | Anthropic `tool_use` wrappers + retry/fallback ladder (`src/llm/generated/toolcalls.ts`) | orchestrator |
| `template.streamFrame` (a **project-local subtype**) | `sseFrames` (custom) | `CouncilFrame` discriminated union + typed `sse()` (`src/web/generated/council-frames.ts`) | Worker **and** React reducer |
| Wizard instance data (`data/wizards/`) | `wizardData` + `wizardRegistry` (custom) | typed roster + render registry (`src/personas/generated/`) | orchestrator + gallery |

The wiring is one file: [`metaobjects.config.ts`](metaobjects.config.ts). Every generator
writes to a named **target** so `meta verify --codegen` diffs the *entire* generated
surface — nothing escapes the gate.

## The money shot — rename a field, watch it fail

The whole point of a metadata spine is that the model and everything generated from it
**cannot silently drift apart**. Prove it in ~10 seconds, offline:

Rename `question` in [`metaobjects/meta-wizard-user-payload.yaml`](metaobjects/meta-wizard-user-payload.yaml)
to anything else, then run `npm run demo:drift`:

```
meta: [brikUser]   (prompt) ERR_VAR_NOT_ON_PAYLOAD: question
meta: [dominoUser] (prompt) ERR_VAR_NOT_ON_PAYLOAD: question
…  (all 10 wizard prompts)
meta: meta verify — 10 drift error(s) across 29 template(s).
meta: meta verify — codegen drift (2 file(s) differ from a fresh regen):
meta:   ~ src/db/generated/WizardUserPayload.ts (committed content differs from a fresh regen)
meta:   ~ src/render/generated/prompts.ts (committed content differs from a fresh regen)
```

One field. **Ten prompt templates and two generated artifacts fail at once** — every
Mustache prompt that binds `{{question}}`, the Zod/DB payload schema
(`WizardUserPayload.ts`), and the typed render handle (`prompts.ts`). That's a guarantee a
single-language ORM structurally can't give you, and the CI workflow
([`.github/workflows/meta-verify.yml`](.github/workflows/meta-verify.yml)) runs exactly
this gate on every PR.

> This repo *is* the demo, so the drift gate is held to its own standard: an earlier
> version routed four generated files outside the checked directories via `../../` path
> escapes, so a breaking wire-format change passed the gate clean. Fixed by putting every
> generator on a named target — see the git history and `docs/how-metaobjects-is-used.md`.

## The four MetaObjects pillars, as exercised here

- **Codegen** — Drizzle/D1 + Zod + typed finders, typed prompt payloads + render handles,
  Anthropic tool-call wrappers, and the SSE frame union, all from the spine.
- **Runtime metadata** — the wizard roster is generated from `data/wizards/` data and drives
  the council loop + the "Meet the Guild" gallery; add a persona, no orchestrator edit.
- **Drift detection** — `meta verify` (templates **and** codegen) on every PR + `npm run demo:drift`.
- **Prompt construction** — typed payload value-objects, external Mustache text resolved by a
  provider, a byte-equivalence snapshot test, and `tool_use` output parsed with a retry/fallback ladder.

This is the **TypeScript** port used end-to-end; MetaObjects' cross-language conformance
(the "one model, many languages" claim) lives upstream at metaobjects.dev. Here the story is
**one model, many outputs**: a single YAML spine → a database, an API's types, LLM prompts,
and an SSE protocol.

## It's a standard, not a framework — extend the metamodel

[`src/codegen/wizardsofodd-provider.ts`](src/codegen/wizardsofodd-provider.ts) is a consumer
registering its own vocabulary, strict-provenance-clean (ADR-0023):

- a **project-local `template.streamFrame` subtype** (the SSE envelope — MetaObjects core has
  no such concept), and
- an Anthropic `@retryReminder` attr **added to** the core `template.toolcall` subtype, with the
  structured fallback payload riding the registered `attr.properties` bag.

Three small custom generators (`sseFrames`, `structuredCompletion`, `wizardRegistry`) implement
the same `Generator` interface as the built-ins.

## Add a wizard — data files, zero TypeScript

A persona is instance data + prompt text, not code: drop `data/wizards/<id>.yaml`, two
`data/templates/wizards/<id>-{system,user}.mustache` files, add the two `template.prompt`
nodes, and a portrait — then `npm run gen:db`. The roster, the gallery, the council loop, and
the drift gate all pick it up. (10 personas ship; 5 run by default, the visitor can enable any subset.)

## Run it yourself

```bash
npm install
echo 'ANTHROPIC_API_KEY = "sk-ant-..."' > .dev.vars   # local only; gitignored
npm run check        # gen → verify (the drift gate) → typecheck → tests
npm run dev          # wrangler dev
```

**Fork & deploy:** create your own Cloudflare KV + D1 and swap their ids in
[`wrangler.jsonc`](wrangler.jsonc) (they're non-secret account resources); set a `SEARCH_URL`
Worker secret if you want the optional SearXNG-backed search (it degrades gracefully without one).
Portraits/background are AI-generated (local SDXL) and covered by the repo license.

## Repo map

```
metaobjects/      the metadata spine (entities, value-objects, prompts, toolcalls, sse-frames)
data/             instance data OUTSIDE the metadata: wizard YAML + Mustache prompt text
codegen/          owned generators (entity/queries/barrel — ADR-0034 scaffold-and-own)
src/codegen/      custom generators + the project provider
src/**/generated/ generated code (drift-gated; never hand-edited)
src/             the Worker: council orchestrator, D1 layer, LLM calls, React SPA, SSR share pages
docs/             architecture.md, adr/, how-metaobjects-is-used.md
.claude/, .metaobjects/  the shipped agent-context (skills + AGENTS.md) for coding agents
```

More: [`docs/architecture.md`](docs/architecture.md) · [`docs/how-metaobjects-is-used.md`](docs/how-metaobjects-is-used.md) · [`docs/adr/`](docs/adr/) · [`docs/runbook.md`](docs/runbook.md).

## Scope & status

Live and deployed on Cloudflare Workers. This is a **reference project**: the app's feature
set is intentionally frozen; bug reports and doc PRs are welcome, and questions about MetaObjects
itself go to [metaobjects.dev](https://metaobjects.dev). Licensed under Apache-2.0.
