// Typed SSE-stream parser. Reads a ReadableStream<Uint8Array> body (from
// `fetch().body`), buffers partial frames across chunk boundaries, yields
// typed CouncilFrame objects.
//
// Frame shape — pulled from the codegen'd discriminated union (one arm per
// template.streamFrame node under metaobjects/sse-frames/). Adding a new SSE
// event = 2-file YAML drop + regen; this parser and the reducer pick up the
// new arm automatically.

export type { CouncilFrame, CouncilFrameEventName } from "../generated/council-frames";
import type { CouncilFrame } from "../generated/council-frames";

/**
 * Raw frame as it comes off the wire — `event` is still an arbitrary string
 * because a malicious or out-of-date server could send an unknown event name.
 * The reducer narrows to the typed CouncilFrame union by event-name switch.
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

/**
 * Narrow a raw frame to a typed CouncilFrame if its event-name is one of the
 * codegen'd declared events. Returns null for unknown events (forward-compat:
 * future servers may emit events this client doesn't yet know about).
 */
export function toTypedFrame(raw: RawCouncilFrame, declared: ReadonlySet<string>): CouncilFrame | null {
  if (!declared.has(raw.event)) return null;
  // Wire-decoded JSON satisfies the declared shape by contract — the orchestrator
  // emits via the typed sseFrame helper, so this assertion is the wire boundary
  // (analogous to crossing a `fetch().json()` boundary).
  return raw as CouncilFrame;
}
