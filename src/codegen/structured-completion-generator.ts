// Custom MO codegen Generator: emits src/llm/generated/toolcalls.ts — typed
// wrappers around `completeStructured` that bake in the try → retry-with-
// stricter-reminder → optional-fallback ladder.
//
// Source of truth: every `template.toolcall` node in the loaded MetaRoot.
// template.toolcall is a core MO subtype; wizardsofoddProvider EXTENDS it with the
// Anthropic @retryReminder attr (src/codegen/wizardsofodd-provider.ts), wired in
// metaobjects.config.ts via the providers: [...] field. Each toolcall node carries:
//   @toolName       wire tool name surfaced to Anthropic
//   @payloadRef     value-object whose Insert Zod schema is the runtime tool schema
//   @retryReminder  reminder appended on retry when the initial call fails
//   @fallback       (optional) canned payload returned on double-failure
//
// Why a new subtype (and not template.output + @toolName attr): template.output
// requires @textRef for the renderable body, and toolcalls have no renderable
// text — the body IS the structured output. See
// docs/features/extending-with-providers.md § "Escalate to a new subtype" for
// the full justification.
//
// Demonstration value: adding a new structured tool to the council is a
// 1-file YAML drop in metaobjects/toolcalls/ + a regen — no orchestrator
// edits, no new prompt constants, no copy-pasted retry ladder.

import type { Generator, EmittedFile, GenContext } from "@metaobjectsdev/codegen-ts";
import { oncePerRun } from "@metaobjectsdev/codegen-ts";
import {
  stripPackage,
  TYPE_TEMPLATE,
  TEMPLATE_SUBTYPE_TOOLCALL,
  TEMPLATE_ATTR_TOOL_NAME,
  TEMPLATE_ATTR_PAYLOAD_REF,
} from "@metaobjectsdev/metadata";
// The Anthropic-flavored attrs live on the project provider; read them through
// the SAME constants it registers them under (no declared-vs-read drift).
import { TEMPLATE_ATTR_RETRY_REMINDER, TEMPLATE_ATTR_FALLBACK } from "./wizardsofodd-provider";

interface ToolcallSpec {
  /** PascalCase-able identifier; drives the emitted function name. */
  name: string;
  /** Wire tool name surfaced to Anthropic (matches the tool block's `name`). */
  toolName: string;
  /** Payload value-object whose Insert schema is the runtime tool schema. */
  payloadRef: string;
  /** Appended to the system prompt on retry when the initial call fails. */
  retryReminder: string;
  /**
   * Optional canned payload returned on double-failure instead of rethrowing.
   * When present, must satisfy the payloadRef's type at runtime — embedded as
   * a typed literal in the generated file.
   */
  fallback?: Record<string, unknown>;
}

function discoverToolcalls(ctx: GenContext): ToolcallSpec[] {
  const specs: ToolcallSpec[] = [];
  // ADR-0039: RESOLVING accessors (children()/attr()) by default — an abstract
  // toolcall + `extends` (say, to share a common @retryReminder) would still
  // resolve. @fallback rides the attr.properties bag (see wizardsofodd-provider.ts);
  // attr() reads it back the same way as a first-class attr.
  for (const child of ctx.loadedRoot.children()) {
    if (child.type !== TYPE_TEMPLATE || child.subType !== TEMPLATE_SUBTYPE_TOOLCALL) continue;
    const toolName = child.attr(TEMPLATE_ATTR_TOOL_NAME);
    const payloadRef = child.attr(TEMPLATE_ATTR_PAYLOAD_REF);
    const retryReminder = child.attr(TEMPLATE_ATTR_RETRY_REMINDER);
    const fallback = child.attr(TEMPLATE_ATTR_FALLBACK);
    if (typeof toolName !== "string" || !toolName) {
      throw new Error(`structured-completion: template.toolcall "${child.name}" is missing required @toolName`);
    }
    if (typeof payloadRef !== "string" || !payloadRef) {
      throw new Error(`structured-completion: template.toolcall "${child.name}" is missing required @payloadRef`);
    }
    if (typeof retryReminder !== "string" || !retryReminder) {
      throw new Error(`structured-completion: template.toolcall "${child.name}" is missing required @retryReminder`);
    }
    specs.push({
      name: child.name,
      toolName,
      // @payloadRef canonicalizes to an FQN (pkg::Type) under 0.15 (ADR-0032/0041);
      // strip the package for the local TS type + import path.
      payloadRef: stripPackage(payloadRef),
      retryReminder,
      ...(fallback !== undefined ? { fallback: fallback as Record<string, unknown> } : {}),
    });
  }
  // Stable order by name so the emitted file is byte-deterministic across runs.
  specs.sort((a, b) => a.name.localeCompare(b.name));
  return specs;
}

function pascalCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function screamingSnake(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
}

function indentJsonAsTsLiteral(value: unknown, indent: number): string {
  // JSON.stringify produces valid TypeScript literal syntax for plain data
  // (objects, arrays, strings, numbers, booleans, null). The fallback payloads
  // are exactly that shape — no functions, no dates, no undefined.
  const pad = " ".repeat(indent);
  return JSON.stringify(value, null, 2)
    .split("\n")
    .map((line, i) => (i === 0 ? line : pad + line))
    .join("\n");
}

function emitToolcallFunction(spec: ToolcallSpec): string {
  const fnName = `callEmit${pascalCase(spec.name).replace(/^Emit/, "")}`;
  // Strip a leading "Emit" if the YAML name already starts that way (e.g.
  // "emitWizardTake" → callEmitWizardTake, not callEmitEmitWizardTake).
  const reminderConst = `${screamingSnake(spec.name)}_REMINDER`;
  const payload = spec.payloadRef;
  const schemaImport = `${payload}InsertSchema`;
  const hasFallback = spec.fallback !== undefined;

  const tryBlock = `    return await completeStructured<${payload}>({
      apiKey: p.apiKey,
      system: p.system,
      messages: p.messages,
      toolName: ${JSON.stringify(spec.toolName)},
      toolSchema: ${schemaImport},
      ...optional,
    });`;

  const retryBlock = `      return await completeStructured<${payload}>({
        apiKey: p.apiKey,
        system: withReminder(p.system, ${reminderConst}),
        messages: p.messages,
        toolName: ${JSON.stringify(spec.toolName)},
        toolSchema: ${schemaImport},
        ...optional,
      });`;

  const fallbackConst = hasFallback ? `${screamingSnake(spec.name)}_FALLBACK` : null;

  const body = hasFallback
    ? `  const optional = pickOptional(p);
  try {
${tryBlock}
  } catch (err) {
    // Only a MALFORMED model response earns a reminder-retry. Transport errors
    // (rate limit, overload, server error) propagate — they are never retried
    // as if the model misbehaved, and never fabricated into the canned fallback.
    if (!(err instanceof MalformedToolCallError)) throw err;
    try {
${retryBlock}
    } catch (retryErr) {
      if (!(retryErr instanceof MalformedToolCallError)) throw retryErr;
      return ${fallbackConst};
    }
  }`
    : `  const optional = pickOptional(p);
  try {
${tryBlock}
  } catch (err) {
    // Reminder-retry only on a malformed response; transport errors propagate.
    if (!(err instanceof MalformedToolCallError)) throw err;
${retryBlock}
  }`;

  const fallbackDecl = hasFallback
    ? `\nconst ${fallbackConst}: ${payload} = ${indentJsonAsTsLiteral(spec.fallback, 0)};\n`
    : "";

  return `const ${reminderConst} =
  ${JSON.stringify(spec.retryReminder)};
${fallbackDecl}
export async function ${fnName}(p: ToolcallParams): Promise<${payload}> {
${body}
}
`;
}

export const structuredCompletion = (): Generator => ({
  name: "structured-completion",
  target: "llm",
  generate: oncePerRun((_entities, ctx): EmittedFile[] => {
    const specs = discoverToolcalls(ctx);

    // Build the set of unique payload value-objects so we import each exactly
    // once. Two toolcalls referencing the same payload (unlikely but allowed)
    // share the import.
    const payloadRefs = Array.from(new Set(specs.map((s) => s.payloadRef))).sort();

    const payloadImports = payloadRefs
      .map(
        (p) =>
          `import { ${p}InsertSchema, type ${p} } from "../../db/generated/${p}";`,
      )
      .join("\n");

    const functions = specs.map(emitToolcallFunction).join("\n");

    const header = `// @generated by @metaobjectsdev/codegen-ts (via structured-completion) — DO NOT EDIT.
// AUTO-GENERATED — re-run \`npm run gen:db\`.
// Source of truth: every template.toolcall node under metaobjects/.
//
// Each callEmit<Name>(params) wrapper calls completeStructured with the
// configured tool name + payload schema. On a MALFORMED first response the
// wrapper retries ONCE with a stricter reminder appended to the system
// prompt. If the YAML declares a \`fallback\`, malformed double-failure returns
// the canned payload; otherwise it rethrows. Transport/API errors (rate limit,
// overload, server error) are NOT retried and NOT turned into a fallback —
// they propagate, so the caller can surface an honest failure instead of a
// fabricated result.

import { completeStructured, MalformedToolCallError, type AnthropicMessage, type SystemBlock } from "../anthropic";
${payloadImports}

export interface ToolcallParams {
  apiKey: string;
  system: string | SystemBlock[];
  messages: AnthropicMessage[];
  fetchImpl?: typeof fetch;
  model?: string;
}

/**
 * Append the stricter reminder to a system prompt, preserving its shape.
 * If the system was a SystemBlock[] (e.g. cache_control marked), the reminder
 * rides as a second non-cached block so the first block remains byte-equal
 * to the original (and therefore cacheable).
 */
function withReminder(system: string | SystemBlock[], reminder: string): string | SystemBlock[] {
  if (typeof system === "string") return \`\${system}\\n\\n\${reminder}\`;
  return [...system, { type: "text", text: reminder }];
}

/**
 * Strip undefined optional keys so exactOptionalPropertyTypes-style strictness
 * in completeStructured does not see an explicit \`undefined\` and complain.
 */
function pickOptional(p: ToolcallParams): { fetchImpl?: typeof fetch; model?: string } {
  const o: { fetchImpl?: typeof fetch; model?: string } = {};
  if (p.fetchImpl !== undefined) o.fetchImpl = p.fetchImpl;
  if (p.model !== undefined) o.model = p.model;
  return o;
}

`;

    const content = header + functions;
    // Bare filename — the engine writes it under the "llm" target's outDir.
    return [{ path: "toolcalls.ts", content }];
  }),
});
