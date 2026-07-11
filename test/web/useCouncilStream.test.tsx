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

  it("omits wizardIds when not provided (back-compat)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockEmptyStream());
    const { result } = renderHook(() => useCouncilStream());
    await act(async () => { await result.current.start("q?", "tok"); });
    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ question: "q?", cfTurnstileToken: "tok" });
  });
});
