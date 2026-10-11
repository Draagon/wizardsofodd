// Custom MO codegen Generator: emits src/db/generated/<Target>.lineage.ts — typed
// mappers between an object and another object whose fields DESCEND from it.
//
// Source of truth: field-level lineage in the metadata. A target field descends
// from a source field when it
//   - `extends: <Source>.<field>` (e.g. CouncilTurn.takeMarkdown extends
//     WizardOutput.takeMarkdown), or
//   - has the source field's name and extends the same abstract root field
//     (e.g. CouncilTurn.stance and WizardOutput.stance both extend wizardStance).
// The second form exists because an enum that extends a concrete field
// (`extends: WizardOutput.stance`) loses the shared generated enum module — it
// inlines its own copy — so enums keep extending the abstract directly.
//
// Without these mappers the field list of WizardOutput was re-spelled by hand in
// every place that persisted or projected it; a field added to the value object
// and its descendants could be silently dropped by one of the copies. Now the
// copies are generated from the same `extends` links the drift gate checks. The same
// mechanism builds the public SharedCouncil view of a Council row: only the
// fields SharedCouncil declares are copied, so the exposure fails closed.
//
// Which mappers to emit is listed in metaobjects.config.ts (only the consumed
// ones — generated code nothing imports is noise).
//
// Conversion rules (all derived from @required on the two fields):
//   forward  source → target fields   optional source → `?? null` (onto a nullable column, or
//                                     onto an optional value field under `nullForAbsent`)
//   reverse  target row → source      optional source from a nullable column → omitted when NULL
// Anything else (a required source field read from a nullable column, an optional
// source written to a NOT NULL column or to a value field without `nullForAbsent`, a
// reverse mapper that misses a required source field) fails generation with the reason.

import type { Generator, EmittedFile, GenContext } from "@metaobjectsdev/codegen-ts";
import { formatTs, oncePerRun } from "@metaobjectsdev/codegen-ts";
import { isMetaObject, isMetaRoot, type MetaField, type MetaObject } from "@metaobjectsdev/metadata";

export interface LineageMapperSpec {
  /** The object the target's fields descend from (e.g. "WizardOutput", "Council"). */
  from: string;
  /** The object whose fields descend from it (e.g. "CouncilTurn"). */
  to: string;
  /** Also emit the reverse mapper, target row → source value. Entity targets only. */
  reverse?: boolean;
  /**
   * Value-object targets only, and required when an optional source field maps onto
   * one: emit `null` for an absent/NULL field, so the mapped object always carries
   * every descended key.
   */
  nullForAbsent?: boolean;
}

interface LineagePair {
  target: MetaField;
  source: MetaField;
}

function findObject(ctx: GenContext, name: string): MetaObject {
  const obj = ctx.loadedRoot.children().find((c) => isMetaObject(c) && c.name === name);
  if (!obj || !isMetaObject(obj)) throw new Error(`lineage-mappers: no object named "${name}"`);
  return obj;
}

/** The target fields that descend from a source field, in the SOURCE's field order. */
function lineageOf(target: MetaObject, source: MetaObject): LineagePair[] {
  const bySource = new Map<string, MetaField>();
  for (const tf of target.fields()) {
    const sup = tf.superData;
    if (!sup) continue;
    // Direct: `extends: Source.field`.
    if (sup.parent && isMetaObject(sup.parent) && sup.parent.name === source.name) {
      bySource.set(sup.name, tf);
      continue;
    }
    // Shared abstract root: same name, same abstract super.
    if (sup.isAbstract && sup.parent && isMetaRoot(sup.parent)) {
      const sf = source.findField(tf.name);
      if (sf?.superData === sup) bySource.set(sf.name, tf);
    }
  }
  return source
    .fields()
    .filter((sf) => bySource.has(sf.name))
    .map((sf) => ({ source: sf, target: bySource.get(sf.name)! }));
}

function lcFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function renderForward(spec: LineageMapperSpec, target: MetaObject, pairs: LineagePair[]): string {
  const isEntity = target.isEntity();
  if (spec.nullForAbsent && isEntity) {
    throw new Error(
      `lineage-mappers: nullForAbsent is for value-object targets; ${target.name} is an entity (its columns are already NULL when absent)`,
    );
  }
  const keys = (ps: LineagePair[]) => ps.map((p) => JSON.stringify(p.target.name)).join(" | ");
  const nullable = spec.nullForAbsent ? pairs.filter((p) => !p.target.isRequired) : [];
  const present = pairs.filter((p) => !nullable.includes(p));
  // The row type (not <Entity>Insert, whose defaulted columns are optional): every
  // descended field is always set, and a row-typed value is assignable to an insert.
  // Under nullForAbsent an optional value field (`T | undefined`) is typed `T | null`.
  const fieldsType = [
    present.length > 0 ? `Pick<${target.name}, ${keys(present)}>` : "",
    nullable.length > 0 ? `{ [K in ${keys(nullable)}]: Exclude<${target.name}[K], undefined> | null }` : "",
  ]
    .filter((t) => t !== "")
    .join(" & ");
  const lines = pairs.map(({ source, target: tf }) => {
    const read = `v.${source.name}`;
    if (source.isRequired) return `    ${tf.name}: ${read},`;
    if (tf.isRequired) {
      throw new Error(
        `lineage-mappers: optional ${spec.from}.${source.name} cannot fill required ${target.name}.${tf.name}`,
      );
    }
    if (!isEntity && !spec.nullForAbsent) {
      throw new Error(
        `lineage-mappers: optional ${spec.from}.${source.name} onto value-object field ${target.name}.${tf.name} needs nullForAbsent on the spec`,
      );
    }
    // Absent (undefined, or a NULL column when the source is an entity row) → null.
    return `    ${tf.name}: ${read} ?? null,`;
  });
  return `/** ${spec.from} → the ${target.name} fields that descend from it. */
export function ${lcFirst(target.name)}FieldsFrom${spec.from}(v: ${spec.from}): ${fieldsType} {
  return {
${lines.join("\n")}
  };
}`;
}

function renderReverse(spec: LineageMapperSpec, source: MetaObject, target: MetaObject, pairs: LineagePair[]): string {
  if (!target.isEntity()) throw new Error(`lineage-mappers: reverse mapper needs an entity target, got ${target.name}`);
  const mapped = new Set(pairs.map((p) => p.source.name));
  for (const sf of source.fields()) {
    if (sf.isRequired && !mapped.has(sf.name)) {
      throw new Error(`lineage-mappers: ${target.name} has no field descending from required ${spec.from}.${sf.name}`);
    }
  }
  const rowType = `Pick<${target.name}, ${pairs.map((p) => JSON.stringify(p.target.name)).join(" | ")}>`;
  const lines = pairs.map(({ source: sf, target: tf }) => {
    if (sf.isRequired) {
      if (!tf.isRequired) {
        throw new Error(
          `lineage-mappers: required ${spec.from}.${sf.name} cannot be read from nullable ${target.name}.${tf.name}`,
        );
      }
      return `    ${sf.name}: row.${tf.name},`;
    }
    return `    ...(row.${tf.name} != null ? { ${sf.name}: row.${tf.name} } : {}),`;
  });
  return `/** A ${target.name} row → the ${spec.from} its fields descend from (NULL optional columns are omitted). */
export function ${lcFirst(spec.from)}From${target.name}(row: ${rowType}): ${spec.from} {
  return {
${lines.join("\n")}
  };
}`;
}

export const lineageMappers = (specs: readonly LineageMapperSpec[]): Generator => ({
  name: "lineage-mappers",
  generate: oncePerRun(async (_entities, ctx): Promise<EmittedFile[]> => {
    const byTarget = new Map<string, LineageMapperSpec[]>();
    for (const spec of specs) byTarget.set(spec.to, [...(byTarget.get(spec.to) ?? []), spec]);

    const files: EmittedFile[] = [];
    for (const [targetName, targetSpecs] of [...byTarget].sort(([a], [b]) => a.localeCompare(b))) {
      const target = findObject(ctx, targetName);
      const imports = new Map<string, Set<string>>();
      const addImport = (module: string, name: string) =>
        imports.set(module, (imports.get(module) ?? new Set()).add(name));
      const bodies: string[] = [];

      for (const spec of targetSpecs) {
        const source = findObject(ctx, spec.from);
        const pairs = lineageOf(target, source);
        if (pairs.length === 0) throw new Error(`lineage-mappers: no ${target.name} field descends from ${spec.from}`);
        addImport(spec.from, spec.from);
        addImport(target.name, target.name);
        bodies.push(renderForward(spec, target, pairs));
        if (spec.reverse) bodies.push(renderReverse(spec, source, target, pairs));
      }

      // Same output dir as the entity/value modules (the default target), flat layout.
      const importLines = [...imports]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([module, names]) => `import type { ${[...names].sort().join(", ")} } from "./${module}";`)
        .join("\n");

      const content = `// @generated by @metaobjectsdev/codegen-ts (via lineage-mappers) — DO NOT EDIT.
// AUTO-GENERATED — re-run \`npm run gen:db\`.
// Source of truth: the \`extends\` lineage of ${target.name}'s fields (metaobjects/).

${importLines}

${bodies.join("\n\n")}
`;
      files.push({ path: `${target.name}.lineage.ts`, content: await formatTs(content) });
    }
    return files;
  }),
});
