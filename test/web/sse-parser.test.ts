import { describe, it, expect } from "vitest";
import { parseSseStream, type RawCouncilFrame } from "../../src/web/lib/sse-parser";

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

async function collect(s: ReadableStream<Uint8Array>): Promise<RawCouncilFrame[]> {
  const frames: RawCouncilFrame[] = [];
  for await (const f of parseSseStream(s)) frames.push(f);
  return frames;
}

describe("parseSseStream", () => {
  it("parses a single council frame", async () => {
    const frames = await collect(streamFrom(['event: council\ndata: {"id":"abc12xyz"}\n\n']));
    expect(frames).toEqual([{ event: "council", data: { id: "abc12xyz" } }]);
  });

  it("parses a multi-frame stream", async () => {
    const frames = await collect(streamFrom([
      'event: council\ndata: {"id":"abc"}\n\n',
      'event: wizard\ndata: {"wizardId":"grumbel","wizardName":"G","take":{"stance":"supports","takeMarkdown":"hi","oneLineSummary":"h","confidence":0.5,"keyClaims":["a"]}}\n\n',
      'event: done\ndata: {"ok":true}\n\n',
    ]));
    expect(frames).toHaveLength(3);
    expect(frames[0].event).toBe("council");
    expect(frames[1].event).toBe("wizard");
    expect(frames[2].event).toBe("done");
  });

  it("handles a frame split across two chunks", async () => {
    const frames = await collect(streamFrom([
      'event: council\ndata: {"id":"',
      'abc12xyz"}\n\n',
    ]));
    expect(frames).toEqual([{ event: "council", data: { id: "abc12xyz" } }]);
  });

  it("handles multiple frames concatenated in one chunk", async () => {
    const frames = await collect(streamFrom([
      'event: council\ndata: {"id":"abc"}\n\nevent: done\ndata: {"ok":true}\n\n',
    ]));
    expect(frames).toHaveLength(2);
  });

  it("ignores trailing whitespace-only data", async () => {
    const frames = await collect(streamFrom(['event: council\ndata: {"id":"abc"}\n\n   \n\n']));
    expect(frames).toHaveLength(1);
  });
});
