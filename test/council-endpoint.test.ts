import { SELF, env } from "cloudflare:test";
import { describe, it, expect, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../src/db/client";

// vitest-pool-workers 0.16 removed the `fetchMock` export. The canonical
// replacement (per CF's own fixtures/vitest-pool-workers-examples/request-mocking)
// is `vi.spyOn(globalThis, "fetch")` with `vi.restoreAllMocks()` between tests.
afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Stub global fetch so calls to api.anthropic.com return canned tool_use
 * replies appropriate to whichever tool was forced. The orchestrator now
 * drives Anthropic via tool_use (Phase O); a plain-text reply would fail
 * the structured-output contract.
 *
 * The `text` parameter is reused as the takeMarkdown / verdict takeMarkdown so
 * existing assertions that grep for the canned string continue to pass.
 */
function mockAnthropic(text: string) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    if (url.startsWith("https://api.anthropic.com/")) {
      const body = JSON.parse((init?.body as string) ?? "{}");
      const toolName: string | undefined = body?.tools?.[0]?.name;
      let payload: unknown;
      if (toolName === "emit_wizard_take") {
        payload = {
          stance: "supports",
          takeMarkdown: text,
          oneLineSummary: text.slice(0, 140),
          confidence: 0.5,
          keyClaims: [],
        };
      } else {
        // verdict tool (or, defensively, any other name) gets a VerdictOutput.
        payload = {
          stance: "yes",
          confidence: 0.5,
          takeMarkdown: text,
          dissents: [],
          evidenceQuality: "thin",
        };
      }
      const content = toolName
        ? [{ type: "tool_use", name: toolName, input: payload }]
        : [{ type: "text", text }];
      return new Response(JSON.stringify({ content }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    // Any unmocked call should not hit the real network — return 500 so it's loud.
    return new Response(`unmocked fetch to ${url}`, { status: 500 });
  });
}

async function readAll(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value);
  }
  return out;
}

describe("POST /api/council", () => {
  it("streams SSE events: 5 wizards + a verdict", async () => {
    mockAnthropic("a take");
    const res = await SELF.fetch("https://wizardsofodd.com/api/council", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "should I rewrite it?", cfTurnstileToken: "test-token" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const body = await readAll(res);
    const wizardEvents = body.match(/event: wizard/g) ?? [];
    expect(wizardEvents).toHaveLength(5);
    expect(body).toContain("event: verdict");
    expect(body).toContain("event: done");
    // Wizards stream before the verdict, which streams before done.
    expect(body.indexOf("event: wizard")).toBeLessThan(body.indexOf("event: verdict"));
    expect(body.indexOf("event: verdict")).toBeLessThan(body.indexOf("event: done"));
  });

  it("rejects an empty question with 400", async () => {
    const res = await SELF.fetch("https://wizardsofodd.com/api/council", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "   " }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a question over 600 characters with 400", async () => {
    const res = await SELF.fetch("https://wizardsofodd.com/api/council", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "x".repeat(601) }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 429 once the per-visitor daily limit is exhausted", async () => {
    const day = new Date().toISOString().slice(0, 10);
    const vid = "11111111-1111-1111-1111-111111111111";
    await env.RATE_LIMIT.put(`rl:v:${day}:${vid}`, "5");
    const res = await SELF.fetch("https://wizardsofodd.com/api/council", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `woo_vid=${vid}` },
      body: JSON.stringify({ question: "one more?", cfTurnstileToken: "test-token" }),
    });
    expect(res.status).toBe(429);
  });

  it("issues a woo_vid cookie on a successful streamed response", async () => {
    mockAnthropic("a take");
    const res = await SELF.fetch("https://wizardsofodd.com/api/council", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "first visit?", cfTurnstileToken: "test-token" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("woo_vid=");
    // Drain the stream so the spy isn't torn down mid-flight.
    await readAll(res);
  });

  it("tracks the same visitor across requests via the minted cookie", async () => {
    mockAnthropic("a take");
    const first = await SELF.fetch("https://wizardsofodd.com/api/council", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "first?", cfTurnstileToken: "test-token" }),
    });
    await readAll(first);
    const cookie = first.headers.get("set-cookie")!;
    const vid = cookie.match(/woo_vid=([^;]+)/)![1];

    // Seed this visitor's counter to one below the default cap of 5.
    const day = new Date().toISOString().slice(0, 10);
    await env.RATE_LIMIT.put(`rl:v:${day}:${vid}`, "4");

    // The 5th request (same cookie) is allowed and streams.
    const second = await SELF.fetch("https://wizardsofodd.com/api/council", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ question: "second?", cfTurnstileToken: "test-token" }),
    });
    await readAll(second);
    expect(second.status).toBe(200);

    // The 6th (same cookie) is blocked — the cookie really is tracking the visitor.
    const third = await SELF.fetch("https://wizardsofodd.com/api/council", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ question: "third?", cfTurnstileToken: "test-token" }),
    });
    expect(third.status).toBe(429);
  });

  it("returns 429 with the ghost message when cfTurnstileToken is missing", async () => {
    const res = await SELF.fetch("https://wizardsofodd.com/api/council", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "a real question" }),
    });
    expect(res.status).toBe(429);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/ghost/i);
  });

  it("returns 429 once the per-IP daily limit is exhausted", async () => {
    const day = new Date().toISOString().slice(0, 10);
    // Pre-fill the IP bucket — use the same hash the middleware computes for 203.0.113.7.
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("203.0.113.7"));
    const hash = Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
    await env.RATE_LIMIT.put(`rl:i:${day}:${hash}`, "10");

    const res = await SELF.fetch("https://wizardsofodd.com/api/council", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.7" },
      body: JSON.stringify({ question: "ip-blocked?", cfTurnstileToken: "test-token" }),
    });
    expect(res.status).toBe(429);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/dwelling/i);
  });
});

describe("POST /api/council wizard selection (W2)", () => {
  it("runs only the selected wizards when wizardIds is provided", async () => {
    mockAnthropic("a take");
    const res = await SELF.fetch("https://wizardsofodd.com/api/council", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "test?", cfTurnstileToken: "test-token", wizardIds: ["grumbel", "pib"] }),
    });
    expect(res.status).toBe(200);
    const text = await readAll(res);
    const wizardFrames = [...text.matchAll(/^event: wizard$/gm)];
    expect(wizardFrames).toHaveLength(2);
    // ...and they are the two selected wizards, not some other pair.
    expect(text).toContain("grumbel");
    expect(text).toContain("pib");
    expect(text).not.toContain("vexil");
  });
});

describe("POST /api/council persistence (Phase A)", () => {
  it("emits an event: council frame carrying a slug before any wizard frame", async () => {
    mockAnthropic("a take");
    const res = await SELF.fetch("https://wizardsofodd.com/api/council", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "persisted?", cfTurnstileToken: "test-token" }),
    });
    const body = await readAll(res);
    const m = body.match(/event: council\ndata: ({[^\n]+})/);
    expect(m).not.toBeNull();
    const data = JSON.parse(m![1]);
    expect(data.id).toMatch(/^[a-zA-Z0-9]{8}$/);
    expect(body.indexOf("event: council")).toBeLessThan(body.indexOf("event: wizard"));
  });

  it("writes 1 council + 5 turn rows and flips status to complete on success", async () => {
    mockAnthropic("a take");
    const res = await SELF.fetch("https://wizardsofodd.com/api/council", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "rows please", cfTurnstileToken: "test-token" }),
    });
    const body = await readAll(res);
    const slug = JSON.parse(body.match(/event: council\ndata: ({[^\n]+})/)![1]).id;

    const db = getDb(env);
    const council = (await db.select().from(schema.councils).where(eq(schema.councils.id, slug)))[0];
    expect(council.status).toBe("complete");
    // Phase O: the verdict free text is now persisted via the placeholder
    // VerdictOutput shape (see src/index.ts). Task 8 replaces the placeholder
    // when the orchestrator emits real structured verdicts.
    expect(council.verdictMarkdown).toBe("a take");
    const turns = await db.select().from(schema.councilTurns).where(eq(schema.councilTurns.councilId, slug));
    expect(turns).toHaveLength(5);
  });
});
