import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * A single system-prompt block. Use `cache_control: { type: "ephemeral" }`
 * to opt into Anthropic prompt caching (5-minute TTL) for the block.
 * https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
 */
export type SystemBlock = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
};

export interface CompleteParams {
  apiKey: string;
  system: string | SystemBlock[];
  messages: AnthropicMessage[];
  model?: string;
  maxTokens?: number;
  /** injectable for tests; defaults to global fetch */
  fetchImpl?: typeof fetch;
}

const API_URL = "https://api.anthropic.com/v1/messages";

export async function complete(params: CompleteParams): Promise<string> {
  const doFetch = params.fetchImpl ?? fetch;
  const res = await doFetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": params.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: params.model ?? "claude-sonnet-4-6",
      max_tokens: params.maxTokens ?? 400,
      system: params.system,
      messages: params.messages,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status} ${res.statusText}: ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  return (data.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("");
}

export interface CompleteStructuredParams<T> extends CompleteParams {
  /** Tool name; Anthropic emits a tool_use block with this name. */
  toolName: string;
  /** Tool description shown to the model (kept short — the schema does the heavy lifting). */
  toolDescription?: string;
  /** Zod schema; converted to JSON Schema for input_schema, then re-applied to validate the returned input. */
  toolSchema: z.ZodType<T>;
}

export async function completeStructured<T>(params: CompleteStructuredParams<T>): Promise<T> {
  const doFetch = params.fetchImpl ?? fetch;
  const inputSchema = zodToJsonSchema(params.toolSchema, { target: "jsonSchema7" });
  const res = await doFetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": params.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: params.model ?? "claude-sonnet-4-6",
      max_tokens: params.maxTokens ?? 1024,
      system: params.system,
      messages: params.messages,
      tools: [{
        name: params.toolName,
        description: params.toolDescription ?? "Emit the structured response for this turn.",
        input_schema: inputSchema,
      }],
      tool_choice: { type: "tool", name: params.toolName },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status} ${res.statusText}: ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as { content?: Array<{ type: string; name?: string; input?: unknown }> };
  const toolUse = (data.content ?? []).find((b) => b.type === "tool_use" && b.name === params.toolName);
  if (!toolUse) {
    throw new Error(`completeStructured: no tool_use block named "${params.toolName}" in response`);
  }
  const parsed = params.toolSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new Error(`completeStructured: validation failed: ${parsed.error.message.slice(0, 200)}`);
  }
  return parsed.data;
}
