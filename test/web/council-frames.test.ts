import { describe, it, expect } from "vitest";
import {
  encodeCouncilFrame,
  isCouncilFrameEvent,
  toCouncilFrame,
  type CouncilFrame,
  type CouncilFrameOf,
} from "../../src/web/generated/council-frames";

// The generated wire helpers (from metaobjects/sse-frames/): the Worker encodes
// whole frames with encodeCouncilFrame, the client narrows decoded frames with
// toCouncilFrame. The declared event set is the template.streamFrame nodes.

describe("encodeCouncilFrame", () => {
  it("writes the event line, the JSON data line, and the blank-line terminator", () => {
    const frame: CouncilFrame = { event: "council", data: { id: "abc12xyz" } };
    expect(encodeCouncilFrame(frame)).toBe('event: council\ndata: {"id":"abc12xyz"}\n\n');
  });

  it("serializes nested payloads as one JSON line", () => {
    const frame: CouncilFrameOf<"verdict"> = {
      event: "verdict",
      data: {
        verdict: { stance: "yes", confidence: 0.5, takeMarkdown: "a\nb", dissents: [], evidenceQuality: "thin" },
      },
    };
    const wire = encodeCouncilFrame(frame);
    expect(wire.split("\n")).toHaveLength(4);
    expect(wire.startsWith("event: verdict\ndata: ")).toBe(true);
    expect(JSON.parse(wire.split("\n")[1]!.slice("data: ".length))).toEqual(frame.data);
  });
});

describe("isCouncilFrameEvent", () => {
  it("accepts every declared event name", () => {
    // The eventName of each template.streamFrame under metaobjects/sse-frames/.
    for (const name of ["council", "wizard", "error", "verdict", "done"]) {
      expect(isCouncilFrameEvent(name)).toBe(true);
    }
  });

  it("rejects an undeclared event name", () => {
    expect(isCouncilFrameEvent("future_event")).toBe(false);
    expect(isCouncilFrameEvent("")).toBe(false);
  });
});

describe("toCouncilFrame", () => {
  it("narrows a raw frame whose event is declared", () => {
    const typed = toCouncilFrame({ event: "done", data: { ok: true } });
    expect(typed).toEqual({ event: "done", data: { ok: true } });
  });

  it("returns null for an undeclared event (forward compatibility)", () => {
    expect(toCouncilFrame({ event: "future_event", data: {} })).toBeNull();
  });
});
