import { describe, it, expect } from "vitest";
import { reducer, initialState, type StreamState } from "../../src/web/hooks/useCouncilStream";
import type { CouncilFrame } from "../../src/web/generated/council-frames";

// Helper: typed CouncilFrame literal so the test cases narrow per-arm and a
// missing/extra field is a compile-time error.
function frameOf(f: CouncilFrame): { type: "frame"; frame: CouncilFrame } {
  return { type: "frame", frame: f };
}

describe("useCouncilStream reducer", () => {
  it("starts in idle", () => {
    expect(initialState.status).toBe("idle");
  });

  it("transitions to streaming + records slug on council frame", () => {
    const s = reducer(initialState, frameOf({ event: "council", data: { id: "abc12xyz" } }));
    expect(s.status).toBe("streaming");
    expect(s.slug).toBe("abc12xyz");
    expect(s.wizardTurns).toEqual([]);
  });

  it("appends wizard turns on wizard frame", () => {
    let s: StreamState = reducer(initialState, frameOf({ event: "council", data: { id: "abc" } }));
    s = reducer(s, frameOf({
      event: "wizard",
      data: {
        wizardId: "grumbel", wizardName: "Grumbel",
        take: { stance: "supports", takeMarkdown: "ship it", oneLineSummary: "ship", confidence: 0.7, keyClaims: ["A"] },
      },
    }));
    expect(s.wizardTurns).toHaveLength(1);
    expect(s.wizardTurns[0]!.kind).toBe("wizard");
    expect(s.wizardTurns[0]!.take?.takeMarkdown).toBe("ship it");
  });

  it("appends error turns on error frame", () => {
    let s: StreamState = reducer(initialState, frameOf({ event: "council", data: { id: "abc" } }));
    s = reducer(s, frameOf({
      event: "error",
      data: { wizardId: "vexil", wizardName: "Vexil", reason: "Riddle unparseable." },
    }));
    expect(s.wizardTurns).toHaveLength(1);
    expect(s.wizardTurns[0]!.kind).toBe("error");
    expect(s.wizardTurns[0]!.reason).toBe("Riddle unparseable.");
  });

  it("records the verdict on verdict frame", () => {
    let s: StreamState = reducer(initialState, frameOf({ event: "council", data: { id: "abc" } }));
    s = reducer(s, frameOf({
      event: "verdict",
      data: { verdict: { stance: "yes", confidence: 0.5, takeMarkdown: "yes.", dissents: [], evidenceQuality: "thin" } },
    }));
    expect(s.verdict?.stance).toBe("yes");
  });

  it("transitions to complete on done frame", () => {
    let s: StreamState = reducer(initialState, frameOf({ event: "council", data: { id: "abc" } }));
    s = reducer(s, frameOf({ event: "done", data: { ok: true } }));
    expect(s.status).toBe("complete");
  });

  it("transitions to error on stream-error action (network failure)", () => {
    const s = reducer({ ...initialState, status: "streaming" }, { type: "streamError", message: "network" });
    expect(s.status).toBe("error");
    expect(s.errorMessage).toBe("network");
  });

  it("ignores frames without an active slug (defensive)", () => {
    const s = reducer(initialState, frameOf({
      event: "wizard",
      data: { wizardId: "x", wizardName: "X", take: { stance: "supports", takeMarkdown: "t", oneLineSummary: "s", confidence: 0.1, keyClaims: [] } },
    }));
    expect(s.status).toBe("idle");
    expect(s.wizardTurns).toEqual([]);
  });
});
