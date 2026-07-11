import { describe, it, expect } from "vitest";
import { z } from "zod";
import { complete, completeStructured } from "../src/llm/anthropic";

function fakeFetch(captured: { body?: any; headers?: any }) {
  return async (_url: string, init: RequestInit) => {
    captured.body = JSON.parse(init.body as string);
    captured.headers = init.headers;
    return new Response(
      JSON.stringify({ content: [{ type: "text", text: "hello from the tower" }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
}

describe("complete", () => {
  it("posts to the Messages API and returns joined text", async () => {
    const captured: { body?: any; headers?: any } = {};
    const text = await complete({
      apiKey: "sk-test",
      model: "claude-sonnet-4-6",
      system: "be a wizard",
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 256,
      fetchImpl: fakeFetch(captured) as unknown as typeof fetch,
    });

    expect(text).toBe("hello from the tower");
    expect(captured.body.model).toBe("claude-sonnet-4-6");
    expect(captured.body.system).toBe("be a wizard");
    expect(captured.body.max_tokens).toBe(256);
    expect(captured.body.messages).toEqual([{ role: "user", content: "hi" }]);
    expect((captured.headers as Record<string, string>)["x-api-key"]).toBe("sk-test");
    expect((captured.headers as Record<string, string>)["anthropic-version"]).toBe("2023-06-01");
  });

  it("throws on non-200 with status in message", async () => {
    const badFetch = async () =>
      new Response("nope", { status: 429, statusText: "Too Many Requests" });
    await expect(
      complete({
        apiKey: "sk-test",
        system: "s",
        messages: [{ role: "user", content: "x" }],
        fetchImpl: badFetch as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/429/);
  });

  it("applies default model and max_tokens when omitted", async () => {
    const captured: { body?: any } = {};
    await complete({
      apiKey: "sk-test",
      system: "s",
      messages: [{ role: "user", content: "x" }],
      fetchImpl: (async (_url: string, init: RequestInit) => {
        captured.body = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ content: [{ type: "text", text: "ok" }] }), { status: 200 });
      }) as unknown as typeof fetch,
    });
    expect(captured.body.model).toBe("claude-sonnet-4-6");
    expect(captured.body.max_tokens).toBe(400);
  });

  it("joins only text blocks and skips non-text blocks", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          content: [
            { type: "text", text: "foo" },
            { type: "tool_use", id: "t1", name: "x", input: {} },
            { type: "text", text: "bar" },
          ],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const text = await complete({
      apiKey: "sk-test",
      system: "s",
      messages: [{ role: "user", content: "x" }],
      fetchImpl,
    });
    expect(text).toBe("foobar");
  });

  it("passes system through verbatim when given a SystemBlock[] (enables cache_control)", async () => {
    const captured: { body?: any } = {};
    const blocks = [{ type: "text" as const, text: "be a wizard", cache_control: { type: "ephemeral" as const } }];
    await complete({
      apiKey: "sk-test",
      system: blocks,
      messages: [{ role: "user", content: "hi" }],
      fetchImpl: (async (_url: string, init: RequestInit) => {
        captured.body = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ content: [{ type: "text", text: "ok" }] }), { status: 200 });
      }) as unknown as typeof fetch,
    });
    expect(captured.body.system).toEqual(blocks);
  });
});

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
      fetchImpl,
    });
    expect(got).toEqual({ stance: "a", note: "hi" });
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
        fetchImpl,
      }),
    ).rejects.toThrow(/validation/i);
  });
});
