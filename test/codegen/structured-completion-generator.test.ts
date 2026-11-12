import { describe, it, expect } from "vitest";
import type { GenContext } from "@metaobjectsdev/codegen-ts";
import { MetaDataLoader, composeRegistry, coreProviders, isMetaObject } from "@metaobjectsdev/metadata";
import { structuredCompletion } from "../../src/codegen/structured-completion-generator";
import { wizardsofoddProvider } from "../../src/codegen/wizardsofodd-provider";

// The structured-completion generator, run against a small in-memory model. The model
// id and the token budget of each tool call are metadata (@model, @maxTokens on the
// template.toolcall), so the generated wrapper is where they reach the HTTP client.
function model(toolcallAttrs: string): string {
  return `
metadata:
  package: demo
  children:
    - object.value:
        name: Answer
        children:
          - field.string:
              name: text
              required: true
    - template.toolcall:
        name: emitAnswer
        toolName: emit_answer
        payloadRef: Answer
        retryReminder: Call the tool.
${toolcallAttrs}
`;
}

async function generate(src: string) {
  const registry = composeRegistry([...coreProviders, wizardsofoddProvider]);
  const { root, errors } = await MetaDataLoader.fromString(src, "yaml", { registry, strict: true });
  expect(errors).toEqual([]);
  const ctx: GenContext = {
    entities: root.children().filter(isMetaObject),
    loadedRoot: root,
    matches: () => true,
    config: { outDir: "generated", extStyle: "none", dbImport: "./db", dialect: "sqlite" },
    warn: () => {},
  };
  return structuredCompletion().generate(ctx);
}

describe("structuredCompletion generator", () => {
  it("passes the toolcall's @model and @maxTokens to every completeStructured call", async () => {
    const [file] = await generate(model("        model: claude-test-model\n        maxTokens: 777"));
    expect(file?.content).toContain('const EMIT_ANSWER_MODEL = "claude-test-model";');
    expect(file?.content).toContain("const EMIT_ANSWER_MAX_TOKENS = 777;");
    // Both the first call and the reminder retry.
    expect(file?.content.match(/model: EMIT_ANSWER_MODEL,/g)).toHaveLength(2);
    expect(file?.content.match(/maxTokens: EMIT_ANSWER_MAX_TOKENS,/g)).toHaveLength(2);
  });

  it("refuses a toolcall that declares no @model", async () => {
    await expect(generate(model("        maxTokens: 777"))).rejects.toThrow(/emitAnswer.*@model/);
  });

  it("refuses a toolcall that declares no @maxTokens", async () => {
    await expect(generate(model("        model: claude-test-model"))).rejects.toThrow(/emitAnswer.*@maxTokens/);
  });
});
