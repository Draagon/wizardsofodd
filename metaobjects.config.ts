import { defineConfig } from "@metaobjectsdev/cli";
// ADR-0034 scaffold-and-own: entityFile / queriesFile / barrel are OWNED local
// copies (scaffolded from @metaobjectsdev/codegen-ts/src/reference/*). We import
// them from ./codegen/generators, not the package — 1.0 REMOVED those four
// (entity/queries/routes/barrel) from `@metaobjectsdev/codegen-ts/generators`
// entirely; they were @deprecated on 0.24/0.25 and there is no longer an export
// to fall back to (ADR-0035 A3, 1.0-readiness G2). Owning the copy means the
// generated shape is ours to change and can never drift out from under us.
import { entityFile } from "./codegen/generators/entity";
import { queriesFile } from "./codegen/generators/queries";
import { barrel } from "./codegen/generators/barrel";
// The /generators subpath STAYS, and everything still exported from it is
// supported public API — the removal was scoped by NAME, not by path. Two axes
// get confused here, so state both:
//   - ownable?   `meta eject --list` names all nine, INCLUDING `names` and
//                `routes-hono`. Having an ownable reference copy is not the same
//                as being removed from the package.
//   - removed?   only entity / queries / routes / barrel.
// So `promptRender` (upstream-owned render engine, no ownable copy) and
// `namesFile` (a stock generator that DOES have an ownable copy, and is still
// exported) are both correctly imported from the package here. Don't cargo-cult
// "own everything" — own a copy when you intend to change its emit; this project
// changed entity/queries/barrel and has no reason to fork the names artifact.
import { namesFile, promptRender } from "@metaobjectsdev/codegen-ts/generators";
import { mustacheTemplates } from "./src/codegen/mustache-templates-generator";
import { wizardData } from "./src/codegen/wizard-data-generator";
import { wizardRegistry } from "./src/codegen/wizard-registry-generator";
import { structuredCompletion } from "./src/codegen/structured-completion-generator";
import { sseFrames } from "./src/codegen/sse-frames-generator";
import { wizardsofoddProvider } from "./src/codegen/wizardsofodd-provider";

// Cloudflare Worker target: SQLite dialect (works directly with drizzle-orm/d1).
//
// No routesFile*() generator: `routes-hono` is ownable via `meta eject` for generic
// CRUD REST routes, but this Worker deliberately exposes no generic entity CRUD
// surface — its only routes are the bespoke SSE council endpoints in src/index.ts.
// So there is nothing for a routes generator to emit here.
//
// `providers: [wizardsofoddProvider]` registers our Anthropic vendor attrs on
// core `template.toolcall` AND the project-local `template.streamFrame` subtype,
// so the loader recognizes them in metaobjects/toolcalls/ and metaobjects/sse-frames/.
// See docs/how-metaobjects-is-used.md and the upstream extending-with-providers page.
//
// There is no `inputs` key: `meta gen` loads metadata via the SDK's loadMemory(),
// which recursively scans the entire metaobjects/ dir (excluding _pending/).
// That's why instance data — e.g. data/wizards/, data/templates/ — lives OUTSIDE
// metaobjects/: anything under metaobjects/ is treated as metadata and must parse
// as such.
export default defineConfig({
  // The top-level outDir IS the implicit "default" (entity-module) target — the
  // Drizzle tables, Zod schemas, and typed queries land next to the DB client.
  outDir: "./src/db/generated",
  // importBase = the base specifier a non-default target uses when it imports an
  // entity module. This is a single-package app whose targets are sibling subdirs
  // at a uniform depth (src/*/generated), so the base is the relative path they'd
  // use — the same "../../db/generated" the custom generators already hardcode. The
  // engine requires it once a generator targets a non-entity-module dir; here nothing
  // materializes it (prompts.ts is self-contained), but it makes the cross-target
  // contract explicit for anyone who later adds one.
  importBase: "../../db/generated",
  dialect: "sqlite",
  // No `dbImport`: since 0.24.3 it is demanded at the point of USE — by a generator
  // that actually emits `import { db } from …`. This project's OWNED queries generator
  // takes `db` as an explicit parameter (see src/db/generated/*.queries.ts) and the
  // Worker builds its client per request, so nothing here ever reads it. Earlier
  // versions demanded it from the model, which is why a placeholder used to sit here.
  // Pin extensionless relative imports. This project compiles under `moduleResolution:
  // "Bundler"` (see tsconfig.json) + a Vite/Worker bundler, where extensionless resolves
  // fine — and the owned generators + existing tree already emit that style. Pinning it
  // keeps the 0.20 default flip (none → "js", aimed at stock nodenext) from churning
  // every generated import; the upgrade diff stays limited to the real behavior changes.
  extStyle: "none",
  providers: [wizardsofoddProvider],
  // Per-target output dirs: each generator writes next to the runtime concern it
  // serves (render handles → render/, roster → personas/, tool wrappers → llm/,
  // SSE frames → web/). Declaring these as TARGETS — instead of `../../` outFile
  // path escapes — is what puts the ENTIRE generated surface under the drift gate:
  // `meta verify --codegen` diffs everything under every target's outDir, so a stale
  // render payload or SSE frame now fails CI the same way a stale DB column does.
  targets: {
    render: { outDir: "./src/render/generated" },
    personas: { outDir: "./src/personas/generated" },
    llm: { outDir: "./src/llm/generated" },
    web: { outDir: "./src/web/generated" },
  },
  generators: [
    entityFile(),
    queriesFile(),
    // <Entity>Names — the physical table/column names as importable constants, so a
    // name is spelled ONCE per run and every other reader points at it (1.0 §A1/§A5).
    // OPT-IN on TypeScript: `generators: [...]` IS the complete suite here, exactly
    // like the JVM's <generators> — there is no default set to inherit from. `meta init`
    // scaffolds it, but this project predates that, so it has to be wired by hand.
    // Nothing in this repo hand-writes SQL (the .sql files under migrations/ are
    // `meta migrate` OUTPUT), so no consumer changes; it is wired for parity, and so
    // that anything added later has the constant sitting there instead of a literal.
    namesFile(),
    barrel(),
    promptRender({ target: "render" }),
    // Custom generators for instance data + project-local subtypes. Each declares
    // its own `target` internally (it emits to exactly one home).
    mustacheTemplates(), // → render target (templates.ts)
    wizardData(), // → personas target (wizards.ts)
    wizardRegistry(), // → personas target (registry.ts)
    structuredCompletion(), // → llm target (toolcalls.ts)
    sseFrames(), // → web target (council-frames.ts)
  ],
});
