import { describe, it, expect } from "vitest";
import { convene, type CouncilEvent } from "../src/council/orchestrator";
import { WIZARDS as GUILD } from "../src/personas/generated/wizards";
import type { WizardOutput } from "../src/db/generated/WizardOutput";
import type { VerdictOutput } from "../src/db/generated/VerdictOutput";
import type { SearchResult } from "../src/llm/web-search";

// ---------- shared canned tool inputs ----------

// `citations` is omitted entirely — WizardOutputInsertSchema treats it as
// optional (Zod's `.optional()` does not accept `null`). The downstream
// orchestrator type carries `string[] | null`, so omission is correct here.
const TAKE_INPUT = {
  stance: "supports",
  takeMarkdown: "a wizardly take",
  oneLineSummary: "a wizardly take",
  confidence: 0.7,
  keyClaims: ["A"],
};

const VERDICT: VerdictOutput = {
  stance: "yes",
  confidence: 0.6,
  takeMarkdown: "the verdict",
  dissents: [],
  evidenceQuality: "thin",
};

function toolResponse(name: string, input: unknown): Response {
  return new Response(
    JSON.stringify({ content: [{ type: "tool_use", name, input }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

interface SeenCall {
  toolName: string;
  systemRaw: string | unknown[];
  systemText: string;
  userContent: string;
}

/**
 * Build a fetchImpl that returns canned tool_use responses and records every
 * call. The caller decides per-call whether to return TAKE, VERDICT, or to
 * fail (status 500) — supports the "wizard 2 throws" scenario.
 */
function mkFetch(opts: {
  onCall?: (n: number, body: any) => "ok" | "fail";
  takeFor?: (wizardIdx: number) => WizardOutput;
  capture?: SeenCall[];
} = {}): typeof fetch {
  let n = 0;
  return (async (_url: unknown, init: RequestInit) => {
    n += 1;
    const body = JSON.parse(init.body as string);
    const toolName: string = body.tools[0].name;
    const systemRaw: string | unknown[] = body.system;
    const systemText = typeof systemRaw === "string"
      ? systemRaw
      : (systemRaw as Array<{ text: string }>).map((b) => b.text).join("\n");
    const userContent: string = body.messages[0]?.content ?? "";
    opts.capture?.push({ toolName, systemRaw, systemText, userContent });
    const decision = opts.onCall?.(n, body) ?? "ok";
    if (decision === "fail") {
      return new Response("nope", { status: 500 });
    }
    if (toolName === "emit_wizard_take") {
      // Count wizards seen so far (one tool call per wizard, in order).
      const wizardIdx = (opts.capture?.filter((c) => c.toolName === "emit_wizard_take").length ?? 1) - 1;
      const take = opts.takeFor?.(wizardIdx) ?? TAKE_INPUT;
      return toolResponse("emit_wizard_take", take);
    }
    return toolResponse("emit_verdict", VERDICT);
  }) as unknown as typeof fetch;
}

describe("convene", () => {
  it("emits one event per wizard in order, then a verdict", async () => {
    const seen: SeenCall[] = [];
    const fetchImpl = mkFetch({ capture: seen });

    const events: CouncilEvent[] = [];
    for await (const ev of convene({ question: "rewrite?", apiKey: "x", fetchImpl })) {
      events.push(ev);
    }

    const wizardEvents = events.filter((e) => e.type === "wizard");
    expect(wizardEvents).toHaveLength(10);
    expect(wizardEvents.map((e) => (e as Extract<CouncilEvent, { type: "wizard" }>).wizardId)).toEqual(
      GUILD.map((p) => p.id),
    );
    const last = events[events.length - 1];
    expect(last.type).toBe("verdict");
    if (last.type === "verdict") {
      expect(last.verdict.takeMarkdown).toBe("the verdict");
    }
    const firstWizard = wizardEvents[0];
    if (firstWizard.type === "wizard") {
      expect(firstWizard.take.takeMarkdown).toBe("a wizardly take");
    }
    // 10 wizard tool calls + 1 verdict tool call
    expect(seen).toHaveLength(11);
    // Each wizard sees the accumulating prior replies (regression guard: not passing []).
    const seenPriors = seen
      .filter((c) => c.toolName === "emit_wizard_take")
      .map((c) => (c.userContent.match(/^- /gm) ?? []).length);
    expect(seenPriors).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("emits an error event if a wizard call throws (after the retry), then continues to verdict", async () => {
    // Each wizard call gets ONE retry — to truly fail wizard #2, we must fail
    // BOTH its first attempt AND its retry. There are 10 wizard slots + 1 verdict.
    // Wizard 1: succeeds on call 1.
    // Wizard 2: fails on calls 2 and 3 (initial + retry).
    // Wizards 3-10: succeed on calls 4, 5, 6, 7, 8, 9, 10, 11.
    // Verdict: succeeds on call 12.
    const fetchImpl = mkFetch({
      onCall: (n) => (n === 2 || n === 3 ? "fail" : "ok"),
    });

    const events: CouncilEvent[] = [];
    for await (const ev of convene({ question: "q", apiKey: "x", fetchImpl })) {
      events.push(ev);
    }

    expect(events.some((e) => e.type === "error")).toBe(true);
    expect(events.filter((e) => e.type === "wizard")).toHaveLength(9);
    const last = events[events.length - 1];
    expect(last.type).toBe("verdict");
  });
});

describe("convene with search", () => {
  it("calls searchClient exactly ONCE before the loop and shares results with ALL wizards", async () => {
    const searchCalls: string[] = [];
    const fakeSources: SearchResult[] = [
      { title: "S1", url: "https://x/1", content: "snippet 1" },
      { title: "S2", url: "https://x/2", content: "snippet 2" },
    ];
    const searchClient = async (query: string): Promise<SearchResult[]> => {
      searchCalls.push(query);
      return fakeSources;
    };

    const seen: SeenCall[] = [];
    const fetchImpl = mkFetch({ capture: seen });

    const events: CouncilEvent[] = [];
    for await (const ev of convene({ question: "what should I do?", apiKey: "x", fetchImpl, search: searchClient })) {
      events.push(ev);
    }

    // searchClient is called EXACTLY ONCE (before the loop), with the user's question
    expect(searchCalls).toEqual(["what should I do?"]);
    // EVERY wizard's call received the Sources block — one search, shared
    const wizardCalls = seen.filter((c) => c.toolName === "emit_wizard_take");
    expect(wizardCalls).toHaveLength(10);
    for (const wc of wizardCalls) {
      expect(wc.userContent).toContain("## Sources");
    }
    expect(events.filter((e) => e.type === "wizard")).toHaveLength(10);
  });

  it("does not call searchClient when one is not provided (backward compatible)", async () => {
    const seen: SeenCall[] = [];
    const fetchImpl = mkFetch({ capture: seen });
    const events: CouncilEvent[] = [];
    for await (const ev of convene({ question: "q", apiKey: "x", fetchImpl })) {
      events.push(ev);
    }
    // 10 wizards + 1 verdict, with no search calls
    expect(seen).toHaveLength(11);
    expect(events.filter((e) => e.type === "wizard")).toHaveLength(10);
  });

  it("a search failure (returns []) does not break the council — all wizards continue without sources", async () => {
    const searchClient = async (): Promise<SearchResult[]> => []; // simulates timeout/network failure
    const seen: SeenCall[] = [];
    const fetchImpl = mkFetch({ capture: seen });
    const events: CouncilEvent[] = [];
    for await (const ev of convene({ question: "q", apiKey: "x", fetchImpl, search: searchClient })) {
      events.push(ev);
    }
    expect(events.filter((e) => e.type === "wizard")).toHaveLength(10);
    expect(events[events.length - 1].type).toBe("verdict");
    // No wizard call should contain a Sources block because the search returned empty
    const wizardCalls = seen.filter((c) => c.toolName === "emit_wizard_take");
    for (const wc of wizardCalls) {
      expect(wc.userContent).not.toContain("## Sources");
    }
  });
});

describe("convene with prompt caching", () => {
  it("passes the wizard system prompt as a SystemBlock[] with cache_control: ephemeral", async () => {
    const seen: SeenCall[] = [];
    const fetchImpl = mkFetch({ capture: seen });
    const events: CouncilEvent[] = [];
    for await (const ev of convene({ question: "q?", apiKey: "x", fetchImpl })) {
      events.push(ev);
    }
    // Wizard calls: first 10 are blocks with cache_control. Verdict (11th) stays a string.
    expect(seen).toHaveLength(11);
    for (let i = 0; i < 10; i++) {
      const sys = seen[i].systemRaw;
      expect(Array.isArray(sys), `wizard ${i} system should be SystemBlock[]`).toBe(true);
      const arr = sys as Array<{ type: string; text: string; cache_control?: { type: string } }>;
      expect(arr).toHaveLength(1);
      expect(arr[0].type).toBe("text");
      expect(arr[0].cache_control).toEqual({ type: "ephemeral" });
      expect(arr[0].text.length).toBeGreaterThan(0);
    }
    expect(typeof seen[10].systemRaw).toBe("string"); // verdict stays a string
  });
});

describe("convene verdict fallback", () => {
  it("yields a synthetic unanswerable verdict when both the verdict call and its retry fail", async () => {
    // 10 wizards succeed on calls 1-10. Verdict initial (11) and retry (12) both fail.
    const fetchImpl = mkFetch({
      onCall: (n) => (n >= 11 ? "fail" : "ok"),
    });
    const events: CouncilEvent[] = [];
    for await (const ev of convene({ question: "q", apiKey: "x", fetchImpl })) {
      events.push(ev);
    }
    const last = events[events.length - 1];
    expect(last.type).toBe("verdict");
    if (last.type === "verdict") {
      expect(last.verdict.stance).toBe("unanswerable");
      expect(last.verdict.confidence).toBe(0);
      expect(last.verdict.evidenceQuality).toBe("none");
    }
  });

  it("emits an honest empty-council verdict WITHOUT calling the Clerk when every wizard fails", async () => {
    // Every wizard call (initial + retry) fails, so no take is produced. The
    // Clerk must NOT be invoked on an empty take-list; the orchestrator emits a
    // canned 'nobody answered' verdict instead.
    const seen: SeenCall[] = [];
    const fetchImpl = mkFetch({ onCall: () => "fail", capture: seen });
    const events: CouncilEvent[] = [];
    for await (const ev of convene({ question: "q", apiKey: "x", fetchImpl })) {
      events.push(ev);
    }
    expect(events.filter((e) => e.type === "wizard")).toHaveLength(0);
    expect(events.filter((e) => e.type === "error")).toHaveLength(10);
    const last = events[events.length - 1];
    expect(last.type).toBe("verdict");
    if (last.type === "verdict") {
      expect(last.verdict.stance).toBe("unanswerable");
      expect(last.verdict.takeMarkdown).toMatch(/no wizard/i);
    }
    // The Clerk (emit_verdict) was never called — no take-list to synthesize.
    expect(seen.some((c) => c.toolName === "emit_verdict")).toBe(false);
  });
});

// The follow-up (clarify) feature was removed; convene is the only council flow.
