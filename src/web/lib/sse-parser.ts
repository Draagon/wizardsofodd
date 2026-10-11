// SSE text-protocol parser. Reads a ReadableStream<Uint8Array> body (from
// `fetch().body`), buffers partial frames across chunk boundaries, and yields
// raw { event, data } frames. Narrowing a raw frame to the declared, typed
// CouncilFrame union is the generated toCouncilFrame (src/web/generated/
// council-frames.ts, from metaobjects/sse-frames/), so adding an SSE event
// needs no change here.

/**
 * Raw frame as it comes off the wire — `event` is still an arbitrary string
 * because a malicious or out-of-date server could send an unknown event name.
 */
export interface RawCouncilFrame {
  event: string;
  data: unknown;
}

export async function* parseSseStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<RawCouncilFrame> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE frames are separated by a blank line ("\n\n").
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const frame = parseFrame(block);
      if (frame !== null) yield frame;
    }
  }
  // Drain any trailing block (some servers don't end with \n\n).
  if (buffer.trim().length > 0) {
    const frame = parseFrame(buffer);
    if (frame !== null) yield frame;
  }
}

function parseFrame(block: string): RawCouncilFrame | null {
  const trimmed = block.trim();
  if (trimmed.length === 0) return null;
  const eventMatch = /^event:\s*(.+)$/m.exec(trimmed);
  const dataMatch = /^data:\s*(.+)$/m.exec(trimmed);
  if (!eventMatch || !dataMatch) return null;
  let data: unknown;
  try {
    data = JSON.parse(dataMatch[1]!.trim());
  } catch {
    return null;
  }
  return { event: eventMatch[1]!.trim(), data };
}
