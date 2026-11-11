import { describe, it, expect } from "vitest";
import { z } from "zod";
import { completeStructured } from "../src/llm/anthropic";

describe("completeStructured", () => {
  const schema = z.object({
    stance: z.enum(["a", "b"]),
    note: z.string(),
  });
  type T = z.infer<typeof schema>;

  const fakeFetch = (responseJson: unknown, status = 200): typeof fetch => {
    return (async () =>
      new Response(JSON.stringify(responseJson), {
        status,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
  };

  it("returns the tool_use input parsed against the schema", async () => {
    const fetchImpl = fakeFetch({
      content: [{ type: "tool_use", name: "emit_take", input: { stance: "a", note: "hi" } }],
    });
    const got = await completeStructured<T>({
      apiKey: "x",
      system: "sys",
      messages: [{ role: "user", content: "u" }],
      toolName: "emit_take",
      toolSchema: schema,
      model: "claude-sonnet-4-6",
      maxTokens: 1024,
      fetchImpl,
    });
    expect(got).toEqual({ stance: "a", note: "hi" });
  });

  it("posts the given model, max_tokens, system and messages to the Messages API", async () => {
    const captured: { body?: string; headers?: Record<string, string> } = {};
    const blocks = [{ type: "text" as const, text: "be a wizard", cache_control: { type: "ephemeral" as const } }];
    const fetchImpl: typeof fetch = (async (_url: string, init: RequestInit) => {
      captured.body = init.body as string;
      captured.headers = init.headers as Record<string, string>;
      return new Response(
        JSON.stringify({ content: [{ type: "tool_use", name: "t", input: { stance: "a", note: "n" } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;
    await completeStructured<T>({
      apiKey: "sk-test",
      system: blocks,
      messages: [{ role: "user", content: "hi" }],
      toolName: "t",
      toolSchema: schema,
      model: "claude-sonnet-4-6",
      maxTokens: 256,
      fetchImpl,
    });
    const body = JSON.parse(captured.body!);
    expect(body.model).toBe("claude-sonnet-4-6");
    expect(body.max_tokens).toBe(256);
    expect(body.system).toEqual(blocks);
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(captured.headers?.["x-api-key"]).toBe("sk-test");
    expect(captured.headers?.["anthropic-version"]).toBe("2023-06-01");
  });

  it("throws on non-200 with status in message", async () => {
    const badFetch = (async () =>
      new Response("nope", { status: 429, statusText: "Too Many Requests" })) as unknown as typeof fetch;
    await expect(
      completeStructured<T>({
        apiKey: "sk-test",
        system: "s",
        messages: [{ role: "user", content: "x" }],
        toolName: "t",
        toolSchema: schema,
        model: "claude-sonnet-4-6",
        maxTokens: 1024,
        fetchImpl: badFetch,
      }),
    ).rejects.toThrow(/429/);
  });

  it("sends tool_choice forcing the named tool", async () => {
    const captured: { body?: string } = {};
    const fetchImpl: typeof fetch = (async (_url: string, init: RequestInit) => {
      captured.body = init.body as string;
      return new Response(
        JSON.stringify({ content: [{ type: "tool_use", name: "t", input: { stance: "a", note: "n" } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;
    await completeStructured<T>({
      apiKey: "x",
      system: "sys",
      messages: [{ role: "user", content: "u" }],
      toolName: "t",
      toolSchema: schema,
      model: "claude-sonnet-4-6",
      maxTokens: 1024,
      fetchImpl,
    });
    const body = JSON.parse(captured.body!);
    expect(body.tool_choice).toEqual({ type: "tool", name: "t" });
    expect(Array.isArray(body.tools)).toBe(true);
    expect(body.tools[0].name).toBe("t");
    expect(body.tools[0].input_schema.type).toBe("object");
  });

  it("throws when no tool_use block is in the response", async () => {
    const fetchImpl = fakeFetch({
      content: [{ type: "text", text: "hello" }],
    });
    await expect(
      completeStructured<T>({
        apiKey: "x",
        system: "s",
        messages: [{ role: "user", content: "u" }],
        toolName: "t",
        toolSchema: schema,
        model: "claude-sonnet-4-6",
        maxTokens: 1024,
        fetchImpl,
      }),
    ).rejects.toThrow(/no tool_use block/i);
  });

  it("throws when tool_use.input fails Zod validation", async () => {
    const fetchImpl = fakeFetch({
      content: [{ type: "tool_use", name: "t", input: { stance: "BAD", note: "n" } }],
    });
    await expect(
      completeStructured<T>({
        apiKey: "x",
        system: "s",
        messages: [{ role: "user", content: "u" }],
        toolName: "t",
        toolSchema: schema,
        model: "claude-sonnet-4-6",
        maxTokens: 1024,
        fetchImpl,
      }),
    ).rejects.toThrow(/validation/i);
  });
});
