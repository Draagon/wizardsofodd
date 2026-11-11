// OWNED generator: aggregate loaders for `relationship.composition`.
//
// Why this is custom: no shipped generator emits it. The stock `queries` generator
// (`queriesFile` from @metaobjectsdev/codegen-ts/generators) writes findById, list,
// create, update and deleteById for every stored entity, plus reverse FK finders, and
// takes no option to drop verbs or to load a composition. This app reads exactly one
// thing through generated code (a council with its ordered turns, src/handlers/share.ts)
// and writes bespoke, status-guarded updates by hand over the generated tables
// (src/db/queries.ts). Wiring the stock generator would emit eight helpers nothing
// calls, and its create/update parse input this app's writes never did.
//
// It used to be an ejected copy of the reference `queries` generator trimmed to reads.
// This replaces that copy: everything except the composition loader is the engine's own
// primitives (`renderFindByIdFn`, `dbTypeBlock`, the shared header), so the copy no
// longer falls behind the reference line by line.
//
// emits: <Root>.queries.ts for each stored object that composes a collection of parts
//        (`relationship.composition`, cardinality many): find<Root>ById and
//        find<Root>With<Parts>, the root row plus its parts ordered by the rest of the
//        part's primary key.
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
  type RenderContext,
  dbTypeBlock,
  effectivePackage,
  entityModuleSpecifier,
  entityOutputPath,
  formatTs,
  GENERATED_EDIT_NOTE,
  GENERATED_HEADER,
  getPkInfo,
  hasAnyRdbSource,
  renderFindByIdFn,
  reverseFksFor,
  sidecarLine,
} from "@metaobjectsdev/codegen-ts";

interface CompositionPart {
  /** The relationship name: the parts' key in the aggregate (e.g. `turns`). */
  relName: string;
  child: MetaObject;
  /** The child's Drizzle table variable (e.g. `councilTurns`). */
  childTable: string;
  /** The child's FK field that references the root (e.g. `councilId`). */
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
      throw new Error(`composition-loaders: ${obj.name}.${rel.name} composes unknown object "${rel.objectRef}"`);
    }
    const fk = reverseFksFor(child).find((f) => f.targetEntity === obj.name);
    if (!fk) {
      throw new Error(
        `composition-loaders: ${obj.name}.${rel.name} composes ${child.name}, which has no identity.reference to ${obj.name}`,
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

function moduleOf(obj: MetaObject, ctx: RenderContext): string {
  return JSON.stringify(
    entityModuleSpecifier(ctx.selfTarget, ctx.entityModuleTarget, effectivePackage(obj), obj.name, ctx.extStyle),
  );
}

function renderLoader(obj: MetaObject, part: CompositionPart, ctx: RenderContext): Code {
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

function renderFile(obj: MetaObject, ctx: RenderContext): string {
  const { import: dbTypeImport, alias: dbTypeAlias } = dbTypeBlock(ctx.dialect);
  const sections: Code[] = [
    code`
${dbTypeImport}
${dbTypeAlias}

import { ${ctx.collectionName(obj.name)}, type ${obj.name} } from ${moduleOf(obj, ctx)};
`,
    renderFindByIdFn(obj, ctx),
    ...compositionPartsOf(obj, ctx).flatMap((part) => [
      code`
import { ${part.childTable}, type ${part.child.name} } from ${moduleOf(part.child, ctx)};
`,
      renderLoader(obj, part, ctx),
    ]),
  ];
  const header =
    `// ${GENERATED_HEADER} — ${GENERATED_EDIT_NOTE}\n` +
    `// Source metadata: ${obj.name} (${obj.fqn()})\n` +
    sidecarLine(`${obj.name}.extra.ts`);
  return header + joinCode(sections, { on: "\n" }).toString();
}

/** A stored object that owns at least one many-part composition. */
function isCompositionRoot(obj: MetaObject): boolean {
  return (
    hasAnyRdbSource(obj) &&
    obj.relationships().some((rel) => rel.subType === RELATIONSHIP_SUBTYPE_COMPOSITION && rel.cardinality === "many")
  );
}

export function compositionLoaders(): Generator {
  return {
    name: "composition-loaders",
    filter: isCompositionRoot,
    // Sole producer of *.queries.ts: an object that stops being a root loses its file.
    orphanPolicy: { owns: (relPath) => relPath.endsWith(".queries.ts") },
    generate: perEntity(async (entity, ctx) => {
      if (!ctx.renderContext) {
        throw new Error("composition-loaders: renderContext is required (provided by runGen)");
      }
      return {
        path: entityOutputPath(ctx.config.outputLayout ?? "flat", entity.package, `${entity.name}.queries.ts`),
        content: await formatTs(renderFile(entity, ctx.renderContext)),
      };
    }),
  };
}
