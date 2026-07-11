import { describe, it, expect } from "vitest";
import { convene, type CouncilEvent } from "../src/council/orchestrator";
import { WIZARD_REGISTRY } from "../src/personas/generated/registry";
import type { WizardOutput } from "../src/db/generated/WizardOutput";

const VALID_TAKE: WizardOutput = {
  stance: "supports",
  takeMarkdown: "Ship it.",
  oneLineSummary: "Just ship.",
  confidence: 0.7,
  keyClaims: ["A", "B"],
  citations: [],
};

const VALID_TAKE_RESPONSE = {
  content: [{ type: "tool_use", name: "emit_wizard_take", input: VALID_TAKE }],
};

const VALID_VERDICT_RESPONSE = {
  content: [{
    type: "tool_use",
    name: "emit_verdict",
    input: {
      stance: "yes",
      confidence: 0.5,
      takeMarkdown: "yes.",
      dissents: [],
      evidenceQuality: "thin",
    },
  }],
};

const INVALID_RESPONSE = { content: [{ type: "text", text: "no tool call" }] };

function r(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  }) as unknown as Response;
}

describe("structured outputs — retry/fallback contract", () => {
  it("wizard malformed → retries once → succeeds → emits wizard event with take", async () => {
    let wizardCalls = 0;
    const fetchImpl: typeof fetch = async (_url, init) => {
      const body = JSON.parse(((init?.body ?? "{}") as string));
      const toolName = body.tools[0].name as string;
      if (toolName === "emit_wizard_take") {
        wizardCalls += 1;
        if (wizardCalls === 1) return r(INVALID_RESPONSE);  // first fails
        return r(VALID_TAKE_RESPONSE);                       // retry succeeds
      }
      return r(VALID_VERDICT_RESPONSE);
    };

    const events: CouncilEvent[] = [];
    for await (const e of convene({
      question: "q?",
      apiKey: "test-key",
      fetchImpl,
      registry: WIZARD_REGISTRY.slice(0, 1),
    })) {
      events.push(e);
    }

    expect(events.length).toBeGreaterThanOrEqual(2);  // 1 wizard + 1 verdict
    const wizardEv = events.find((e) => e.type === "wizard");
    expect(wizardEv?.type).toBe("wizard");
    if (wizardEv?.type === "wizard") {
      expect(wizardEv.take.takeMarkdown).toBe("Ship it.");
    }
    expect(wizardCalls).toBe(2);  // first failed, retry succeeded
  });

  it("wizard malformed twice → emits error event (no take)", async () => {
    const fetchImpl: typeof fetch = async (_url, init) => {
      const body = JSON.parse(((init?.body ?? "{}") as string));
      const toolName = body.tools[0].name as string;
      if (toolName === "emit_wizard_take") return r(INVALID_RESPONSE);
      return r(VALID_VERDICT_RESPONSE);
    };

    const events: CouncilEvent[] = [];
    for await (const e of convene({
      question: "q?",
      apiKey: "test-key",
      fetchImpl,
      registry: WIZARD_REGISTRY.slice(0, 1),
    })) {
      events.push(e);
    }

    const errEv = events.find((e) => e.type === "error");
    expect(errEv?.type).toBe("error");
    if (errEv?.type === "error") {
      expect(errEv.reason).toBeTruthy();
      expect(errEv.wizardId).toBe(WIZARD_REGISTRY[0]!.wizard.id);
    }
    // No wizard event emitted (only error)
    expect(events.find((e) => e.type === "wizard")).toBeUndefined();
  });

  it("verdict malformed twice → falls back to {unanswerable, confidence:0}", async () => {
    let verdictCalls = 0;
    const fetchImpl: typeof fetch = async (_url, init) => {
      const body = JSON.parse(((init?.body ?? "{}") as string));
      const toolName = body.tools[0].name as string;
      if (toolName === "emit_wizard_take") return r(VALID_TAKE_RESPONSE);
      verdictCalls += 1;
      return r(INVALID_RESPONSE);  // every verdict call fails
    };

    const events: CouncilEvent[] = [];
    for await (const e of convene({
      question: "q?",
      apiKey: "test-key",
      fetchImpl,
      registry: WIZARD_REGISTRY.slice(0, 1),
    })) {
      events.push(e);
    }

    const verdictEv = events.find((e) => e.type === "verdict");
    expect(verdictEv?.type).toBe("verdict");
    if (verdictEv?.type === "verdict") {
      expect(verdictEv.verdict.stance).toBe("unanswerable");
      expect(verdictEv.verdict.confidence).toBe(0);
      expect(verdictEv.verdict.evidenceQuality).toBe("none");
    }
    expect(verdictCalls).toBe(2);  // initial + 1 retry
  });
});
