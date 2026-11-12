import { defineConfig } from "@metaobjectsdev/cli";
// The entity modules, the barrel, the <Entity>Names constants and the prompt render
// handles are the SHIPPED generators, imported as-is: this project changes nothing
// they emit, so it owns no copy of them (an unchanged owned copy only falls behind
// the reference; `meta eject --list` reports any it finds).
import { barrel, docsSiteFile, entityFile, namesFile, promptRender } from "@metaobjectsdev/codegen-ts/generators";
// Owned generators: each emits something no shipped generator does, and its header
// says what and why. codegen/generators/ holds the one for the persistence target;
// src/codegen/ holds the ones for prompts, personas, tool calls and SSE frames.
import { compositionLoaders } from "./codegen/generators/composition-loaders";
import { mustacheTemplates } from "./src/codegen/mustache-templates-generator";
import { wizardData } from "./src/codegen/wizard-data-generator";
import { wizardRegistry } from "./src/codegen/wizard-registry-generator";
import { structuredCompletion } from "./src/codegen/structured-completion-generator";
import { sseFrames } from "./src/codegen/sse-frames-generator";
import { lineageMappers } from "./src/codegen/lineage-mappers-generator";
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
  // that actually emits `import { db } from …`. This project's composition loaders
  // take `db` as an explicit parameter (see src/db/generated/*.queries.ts) and the
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
    // Documentation target (every docs factory writes here unless given another `target`).
    // The metaobjects.dev site deploy clones this repo and runs
    // `meta gen --generators docs-site`; the site lands in ./docs/generated/site. The
    // directory is git-ignored build output, so `meta verify --codegen` does not compare it.
    docs: { outDir: "./docs/generated" },
  },
  generators: [
    entityFile(),
    // The only generated read: find<Root>With<Parts> for a composition (Council + its
    // turns). No `queriesFile()`: this app's writes are hand-written, status-guarded
    // Drizzle updates (src/db/queries.ts), so stock CRUD helpers would go unused.
    compositionLoaders(),
    // <Entity>Names — the physical table/column names as importable constants, so a
    // name is spelled ONCE per run and every other reader points at it (1.0 §A1/§A5).
    // OPT-IN on TypeScript: `generators: [...]` IS the complete suite here, exactly
    // like the JVM's <generators> — there is no default set to inherit from. `meta init`
    // scaffolds it, but this project predates that, so it has to be wired by hand.
    // Nothing in src/ writes raw SQL: the generated Drizzle tables read these names,
    // and new migrations under migrations/ are `meta migrate --dialect d1` output
    // (0001-0005 were hand-written before the project adopted it; see
    // docs/runbook.md "Migrate"). It is wired so that anything added later has the
    // constant sitting there instead of a literal.
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
    // Field-lineage mappers (→ default target, <Target>.lineage.ts): the copies
    // between an object and the objects whose fields `extends` it. Listed
    // explicitly so only the mappers the app actually calls are emitted.
    lineageMappers([
      { from: "WizardOutput", to: "CouncilTurn", reverse: true }, // persist a take / rehydrate it
      { from: "WizardOutput", to: "TurnLens" }, // project a prior take into the prompt payload
      // Store a verdict on its council / read it back (null until the council completes).
      { from: "VerdictOutput", to: "Council", reverse: "orNull" },
      // The public /c/:slug.json view: no visitorId, and a NULL column is served as null.
      { from: "Council", to: "SharedCouncil", nullForAbsent: true },
      { from: "CouncilTurn", to: "SharedTurn", nullForAbsent: true },
    ]),
    // The browsable docs site for the model (→ docs target, site/). `prompts` points at
    // the external Mustache sources under data/ (outside metaobjects/) so the site shows
    // prompt TEXT, not just the declarations. `title` is pinned: it defaults to the checkout's
    // directory name, which would make the site differ from one clone to the next.
    docsSiteFile({ prompts: "data/templates", title: "The Wizards of Odd" }),
  ],
});
