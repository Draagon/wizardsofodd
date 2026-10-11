// REFERENCE TEMPLATE — copy this into your repo (e.g. codegen/generators/queries.ts) and own it.
// Then import it LOCALLY in metaobjects.config.ts:
//   import { queriesFile } from "./codegen/generators/queries.js";
//
// RUNTIME: this file executes under whatever runs `meta gen`, and the published CLI's
// shebang is `#!/usr/bin/env node` — so it runs under NODE even in a Bun project. Do not
// reach for `Bun.*` globals here; they are undefined and take the whole run down with
// `Bun is not defined`. Use `node:` builtins instead.
// targets:       Drizzle. Emitted helpers take `db` as a PARAMETER rather than importing
//                a module singleton, so they compose with any caller that already holds a
//                connection — including a server-rendered component. Swap the
//                `render<Verb>Fn` primitives (findById/list/create/update/deleteById) and
//                the inline `Db` type block above them to emit for another query builder.
// use-when:      you want generated typed finders over Drizzle. Drop it if you hand-write
//                all of your data access.
// THIS COPY:     trimmed to READ-ONLY finders (a worked example of the "drop verbs"
//                customization). This app's writes are bespoke — hand-rolled inserts and
//                updates in src/db/queries.ts over these generated row types — the same
//                stance as the deliberately-absent routes generator (see
//                metaobjects.config.ts). So create/update/delete, and the #203
//                insertPreserving escape hatch that attaches to create, are all dropped.
// emits:         <target>/<Entity>.queries.ts per source-backed object (any source.rdb kind,
//                incl. read-only projections) — skipped for sourceless objects (incl. every
//                object.value, source-less by value purity) and TPH subtypes (#248 R2).
// customize:     the vanilla CRUD assembly below is OWNED — reorder, drop verbs (e.g. no delete),
//                change the Db type alias, add your own finders. The render<Verb>Fn primitives emit
//                each block; call your own instead to change a verb's body.
// composes-with: entity.ts (imports the table + InsertSchema it emits).
//
// NOTE: the advanced TPH-base + projection variants delegate to the engine's composer
// (`renderQueriesFile`) — they're rarely customized. To own those too, copy their branches
// out of the package source. The vanilla path here is byte-identical to the built-in.

// ts-poet combinators come from the engine package, NOT a bare "ts-poet" import: the
// Code sections composed here must share ONE ts-poet instance with the render*
// primitives below, or (with a globally-installed / linked CLI, where the project and
// the CLI resolve ts-poet to different physical copies) every section renders
// standalone with its own duplicate import header.
import { code, imp, joinCode, type Code } from "@metaobjectsdev/codegen-ts";
import {
  isMetaObject,
  resolveObjectRef,
  RELATIONSHIP_SUBTYPE_COMPOSITION,
  type MetaObject,
} from "@metaobjectsdev/metadata";
import {
  perEntity,
  type Generator,
  type GeneratorFactory,
  type RenderContext,
  entityModuleSpecifier,
  renderFindByIdFn,
  renderListFn,
  renderReverseFinderFns,
  reverseFksFor,
  getPkInfo,
  isTphDiscriminatorBase,
  isProjection,
  isWriteThrough,
  isTphSubtype,
  hasAnyRdbSource,
  renderQueriesFile, // engine composer — used for the delegated variants
  formatTs,
  entityOutputPath,
  GENERATED_HEADER,
} from "@metaobjectsdev/codegen-ts";

// --- composition (OWNED for the common case) ---
function renderQueries(obj: MetaObject, ctx: RenderContext): string {
  // Advanced variants delegate to the engine (byte-identical). Own them by copying their source.
  // #214 — a write-through entity read-view (reads → replica view, writes → table) delegates
  // too; owning it inline would duplicate the hybrid read/write routing.
  if (isTphDiscriminatorBase(obj, ctx.loadedRoot) || isProjection(obj) || isWriteThrough(obj)) {
    return renderQueriesFile(obj, ctx);
  }

  const entityName = obj.name;
  const entityFileName = entityModuleSpecifier(
    ctx.selfTarget,
    ctx.entityModuleTarget,
    obj.package,
    entityName,
    ctx.extStyle,
  );
  const varName = ctx.collectionName(entityName);

  // `db` is parameter-passed into every finder (ADR-0008). Emit the dialect-correct
  // Drizzle type alias so signatures typecheck without the consumer constructing one.
  // Keep EVERY type argument as open as Drizzle's own constraint allows — a `Db` this
  // alias cannot name is a helper nobody can call, and uncompilable generated code looks
  // exactly like unused generated code from outside. Both the driver axis (base classes,
  // not `NodePgDatabase` / `<"async">`) and the schema axis (`Record<string, unknown>`,
  // Drizzle's own `TFullSchema extends …` bound, NOT its `Record<string, never>` default)
  // have been re-pinned once already; do not narrow either again. A schema-carrying
  // `drizzle(client, { schema })` must assign, and so must a schema-less `drizzle(client)`.
  const dbTypeImport =
    ctx.dialect === "postgres"
      ? `import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";`
      : `import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";`;
  const dbTypeAlias =
    ctx.dialect === "postgres"
      ? `type Db = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;`
      : `type Db = BaseSQLiteDatabase<"sync" | "async", unknown, Record<string, unknown>>;`;

  const literalImports = code`
${dbTypeImport}
${dbTypeAlias}

import { ${varName}, type ${entityName} } from ${JSON.stringify(entityFileName)};
`;

  const sections: Code[] = [
    literalImports,
    renderFindByIdFn(obj, ctx),
    renderListFn(obj, ctx),
  ];

  // ADR-0038 — reverse-relationship navigation as explicit FK finders. One
  // find<Plural>By<FkField> (+ batched …In) per FK this entity holds. OWNED:
  // drop this loop if you don't want reverse finders.
  for (const fk of reverseFksFor(obj)) {
    sections.push(renderReverseFinderFns(obj, fk, ctx));
  }

  // OWNED addition — one aggregate loader per composition this entity owns
  // (`relationship.composition` with cardinality many): the parent row plus its
  // parts, keyed by the relationship's name. See renderCompositionLoader.
  for (const part of compositionPartsOf(obj, ctx)) {
    const partModule = entityModuleSpecifier(
      ctx.selfTarget,
      ctx.entityModuleTarget,
      part.child.package,
      part.child.name,
      ctx.extStyle,
    );
    sections.push(code`
import { ${part.childTable}, type ${part.child.name} } from ${JSON.stringify(partModule)};
`);
    sections.push(renderCompositionLoader(obj, part, ctx));
  }

  const body = joinCode(sections, { on: "\n" }).toString();
  const header =
    `// ${GENERATED_HEADER} — DO NOT EDIT.\n` +
    `// Source metadata: ${entityName} (${obj.fqn()})\n` +
    `// Customize via ${entityName}.extra.ts in this directory (additional queries, custom logic).\n`;
  return header + body;
}

// --- OWNED: composition aggregate loaders ---------------------------------
// A `relationship.composition` with cardinality many says the parent OWNS a
// collection of child rows (cascade on delete). The loader reads the parent by
// id and its parts through the child's reference identity back to the parent,
// ordered by the rest of the child's primary key — for a part keyed
// (parentId, ordinal) that is the part's position within its parent.
interface CompositionPart {
  /** The relationship name — the parts' key in the aggregate (e.g. `turns`). */
  relName: string;
  child: MetaObject;
  /** The child's Drizzle table variable (e.g. `councilTurns`). */
  childTable: string;
  /** The child's FK field that references the parent (e.g. `councilId`). */
  fkField: string;
  /** The child's primary-key fields after the FK, in order (e.g. [`ordinal`]). */
  orderFields: string[];
}

function compositionPartsOf(obj: MetaObject, ctx: RenderContext): CompositionPart[] {
  const parts: CompositionPart[] = [];
  for (const rel of obj.relationships()) {
    if (rel.subType !== RELATIONSHIP_SUBTYPE_COMPOSITION || rel.cardinality !== "many") continue;
    const { node: child } = resolveObjectRef(
      ctx.loadedRoot,
      rel.objectRef ?? "",
      obj.package ?? obj.fileDefaultPackage ?? "",
    );
    if (!child || !isMetaObject(child)) {
      throw new Error(`queries-file: ${obj.name}.${rel.name} composes unknown object "${rel.objectRef}"`);
    }
    const fk = reverseFksFor(child).find((f) => f.targetEntity === obj.name);
    if (!fk) {
      throw new Error(
        `queries-file: ${obj.name}.${rel.name} composes ${child.name}, which has no identity.reference to ${obj.name}`,
      );
    }
    const pkFields = child.primaryIdentity()?.fields ?? [];
    parts.push({
      relName: rel.name,
      child,
      childTable: ctx.collectionName(child.name),
      fkField: fk.fkField,
      orderFields: pkFields.filter((f) => f !== fk.fkField),
    });
  }
  return parts;
}

function renderCompositionLoader(obj: MetaObject, part: CompositionPart, ctx: RenderContext): Code {
  const entityName = obj.name;
  const parentVar = entityName.charAt(0).toLowerCase() + entityName.slice(1);
  const relPascal = part.relName.charAt(0).toUpperCase() + part.relName.slice(1);
  const aggregate = `${entityName}With${relPascal}`;
  const { fieldName: pkField, tsType: pkType } = getPkInfo(obj, ctx);
  const eqSym = imp("eq@drizzle-orm");
  const ascSym = imp("asc@drizzle-orm");
  const orderBy = part.orderFields.map((f) => code`${ascSym}(${part.childTable}.${f})`);
  return code`
/** A ${entityName} with the ${part.child.name} rows it owns (relationship.composition \`${part.relName}\`). */
export interface ${aggregate} {
  ${parentVar}: ${entityName};
  ${part.relName}: ${part.child.name}[];
}

/** Load a ${entityName} and its \`${part.relName}\` (ordered by ${part.orderFields.join(", ") || "storage order"}); null when absent. */
export async function find${aggregate}(db: Db, ${pkField}: ${pkType}): Promise<${aggregate} | null> {
  const ${parentVar} = await find${entityName}ById(db, ${pkField});
  if (!${parentVar}) return null;
  const ${part.relName} = await db
    .select()
    .from(${part.childTable})
    .where(${eqSym}(${part.childTable}.${part.fkField}, ${pkField}))${orderBy.length > 0 ? code`
    .orderBy(${joinCode(orderBy, { on: ", " })})` : ""};
  return { ${parentVar}, ${part.relName} };
}
`;
}

export interface QueriesFileOpts {
  filter?: (entity: MetaObject) => boolean;
  target?: string;
}

// #248 R2: persistability derives from declared/inherited source, never subtype.
// An object with no source.rdb (of ANY kind) isn't backed by any store — the
// rendered queries module would emit findById/updateById/deleteById against
// Drizzle table/schema exports the entity file never emits for it (value
// objects are subsumed here too: value purity bans sources on them, so no
// loadable value ever has hasAnyRdbSource === true). TPH subtypes emit no
// standalone queries file either — their per-subtype CRUD helpers live in the
// discriminator base's queries file (which targets the single shared table).
const skipNonQueryable = (e: MetaObject): boolean => hasAnyRdbSource(e) && !isTphSubtype(e);

export const queriesFile = function queriesFile(opts?: QueriesFileOpts): Generator {
  const userFilter = opts?.filter;
  const filter: (e: MetaObject) => boolean = userFilter
    ? (e) => skipNonQueryable(e) && userFilter(e)
    : skipNonQueryable;

  const generator: Generator = {
    name: "queries-file",
    filter,
    generate: perEntity(async (entity, ctx) => {
      if (!ctx.renderContext) {
        throw new Error("queries-file: renderContext is required (provided by runGen)");
      }
      return {
        path: entityOutputPath(ctx.config.outputLayout ?? "flat", entity.package, `${entity.name}.queries.ts`),
        content: await formatTs(renderQueries(entity, ctx.renderContext)),
      };
    }),
  };
  if (opts?.target) {
    generator.target = opts.target;
  }
  return generator;
} as GeneratorFactory<QueriesFileOpts>;
