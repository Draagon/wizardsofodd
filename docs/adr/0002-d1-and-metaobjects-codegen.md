# 0002 — D1 + MetaObjects codegen for persistence

**Status:** Accepted. Shipped via `@metaobjectsdev/*@0.7.0-rc.2` (2026-05-27).
**Date:** 2026-05-24
**Last amended:** 2026-05-27 (see § "What shipped" at the bottom)

## Context

Phase 2 of wizardsofodd adds shareable `/c/<slug>` URLs for completed councils.
That requires persistence — store the question + 5 wizard turns + verdict,
return them by slug.

Sub-decisions:

**Storage choice:**
- Cloudflare KV (key-value) — simplest; we already use it for rate limits;
  fine for "store JSON by slug." No query path; eventually-consistent across
  regions.
- Cloudflare D1 (SQLite at the edge) — first-class Workers binding; real SQL;
  enables future queries ("recent councils", "best Grumbel quotes", embeddings).
- External Postgres on Railway — proper, but contradicts ADR-0001 (stay on CF).
- Turso/libsql — same shape as D1 but third-party; no reason to add a vendor.

**Schema authoring:**
- Hand-write Drizzle schema in TS — fastest to ship; we own all the bytes.
- **MetaObjects codegen** — the metadata standard this app adopts — takes
  a JSON entity definition and emits Drizzle table defs + Zod validators + TS
  types. The whole *point* of MetaObjects is "the metamodel is the spine; generated
  code is disposable." Using it here is eating our own dog food.

## Decision

**Storage:** Cloudflare D1, exposed via the `DB` binding. Drizzle ORM
(`drizzle-orm/d1`) for the query API — its D1 adapter is Worker-compatible (no
Node deps), unlike Drizzle's Node-only adapters.

**Schema:** authored as MetaObjects entities in YAML
(`metaobjects/meta-council.yaml`, `metaobjects/meta-council-turn.yaml`,
plus value-object meta files for the structured outputs) and generated to
`src/db/generated/` via `@metaobjectsdev/codegen-ts`. Generated files are
committed so production deploys don't need the MetaObjects repo present.

**Hand-written queries:** the *codegen* gives us starter `findCouncilById` /
`createCouncil` helpers, but the multi-table and partial-update queries
(`recordTurn`, `finalizeCouncil`, `getCouncilWithTurns`) we write by hand in
`src/db/queries.ts` so we can shape them precisely to our domain.

**Migrations:** `meta migrate` from MetaObjects emits SQL up/down files;
applied to D1 via `wrangler d1 migrations apply`. Until upstream gets a
D1-native driver, this is the workflow.

## Consequences

**+** Schema is metadata-driven — adding a column means editing JSON, running
`npm run gen:db`, regenerating the migration. The intent lives in the metadata,
not scattered across Drizzle definitions.

**+** Real eats-own-dog-food on MetaObjects. Surfaced real upstream gaps
(field.enum not in 0.5.0, no D1-aware migrate-ts) — that feedback is now in
the maintainer's metaobjects backlog.

**+** Stays on Cloudflare — no Railway, no Postgres, no new infra cost. Same
deploy surface as ADR-0001.

**+** D1 queries are type-safe via the generated Drizzle types; Zod validators
guard the API boundary.

**-** **MetaObjects 0.5.0 had gaps** that bit us mid-implementation. They
are all fixed upstream in 0.7.0-rc.2 — see § "What shipped" below for the
resolution map. Original list left for historical context:
- No `field.enum` registration → `status` and `kind` columns ended up as plain
  text. We'd compensate with Zod narrowing at the API edge.
- `meta migrate` doesn't have a D1 driver → we generate SQL against a temp
  local SQLite, then apply via `wrangler d1 execute`. Workable but awkward.
- Generated `deleteXById` has a D1 response-shape bug (assumes libsql's
  `rowsAffected`). We don't use that helper in the hot path; flagged for
  upstream.
- Generated camelCase property names diverge from the snake_case SQL columns
  enough to require care.

**-** Drizzle adds ~50KB to the Worker bundle. Negligible at our scale.

## Alternatives we ruled out

- **KV blob (`councils/<slug>` → JSON of the whole council)** — simpler, but
  closes off any future query/listing/embedding path. The two-table schema
  (`councils`, `council_turns`) is cheap on SQLite and unlocks future use cases.
- **Hand-written Drizzle without MetaObjects** — would ship faster, but
  defeats the eats-dog-food point and means schema lives only in code.

## What shipped (amendment 2026-05-27)

All of the 0.5.0 gaps listed under § Consequences are resolved upstream in
`@metaobjectsdev/*@0.7.0-rc.2` (released 2026-05-27 — see
`docs/runbook.md` § "Tech debt"):

| Original gap | Resolved by | Upstream commit |
|---|---|---|
| `field.enum` not registered | `field.enum` first-class subtype + Drizzle text-with-CHECK + Zod `z.enum()` + literal-narrowed row type | `265f0a8` / `6752dbe7` |
| `meta migrate` lacks D1 driver | `--dialect d1` with `wrangler.toml` binding resolution + `introspectD1` falling back when SQLite functions are blocked | landed in 0.7.0-rc.1 |
| Generated `deleteXById` D1 shape bug | Driver-aware Drizzle delete helpers | landed in 0.7.0-rc.1 |
| camelCase ↔ snake_case mismatch | `@column` attr now drives Drizzle column name; field.name stays camelCase | landed in 0.7.0-rc.1 |
| `object.value` emitted dead Drizzle tables | `source.rdb` discriminator filter — entities without writable rdb source emit interface + Zod only | `4c5a157c` |
| Nested object refs in JSON arrays typed `unknown` | `.$type<RefName[]>()` via ts-poet `imp()` cross-module hoist | `25add878` |

Phase F shipped on the metadata-driven foundation, Phase O persists every
council turn column-per-field to D1, Phase U serves SSR shares from
`/c/:slug`. The persistence path described in the original Decision section
is live in production.
