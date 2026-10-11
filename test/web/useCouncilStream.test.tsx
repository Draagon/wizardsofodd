import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCouncilStream } from "../../src/web/hooks/useCouncilStream";

afterEach(() => vi.restoreAllMocks());

function mockEmptyStream() {
  const body = new ReadableStream<Uint8Array>({ start(c) { c.close(); } });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

describe("useCouncilStream.start", () => {
  it("includes wizardIds in the POST body when provided", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockEmptyStream());
    const { result } = renderHook(() => useCouncilStream());
    await act(async () => { await result.current.start("q?", "tok", ["grumbel", "brik"]); });
    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      question: "q?", cfTurnstileToken: "tok", wizardIds: ["grumbel", "brik"],
    });
  });

  it("dispatches declared frames from the stream and skips undeclared events", async () => {
    const wire =
      'event: council\ndata: {"id":"abc12xyz"}\n\n' +
      'event: future_event\ndata: {"x":1}\n\n' +
      'event: error\ndata: {"wizardId":"pib","wizardName":"Pib","reason":"lost"}\n\n' +
      'event: done\ndata: {"ok":true}\n\n';
    const body = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(new TextEncoder().encode(wire)); c.close(); },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }),
    );
    const { result } = renderHook(() => useCouncilStream());
    await act(async () => { await result.current.start("q?", "tok"); });
    expect(result.current.state.status).toBe("complete");
    expect(result.current.state.slug).toBe("abc12xyz");
    expect(result.current.state.wizardTurns).toHaveLength(1);
    expect(result.current.state.wizardTurns[0]!.wizardId).toBe("pib");
  });

  it("omits wizardIds when not provided (back-compat)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockEmptyStream());
    const { result } = renderHook(() => useCouncilStream());
    await act(async () => { await result.current.start("q?", "tok"); });
    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ question: "q?", cfTurnstileToken: "tok" });
  });
});
