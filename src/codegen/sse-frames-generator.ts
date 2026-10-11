// Custom MO codegen Generator: emits src/web/generated/council-frames.ts — a
// discriminated-union `CouncilFrame` type spanning every declared SSE event
// the council orchestrator emits, plus the wire helpers every tier shares:
// encodeCouncilFrame (Worker, emit side) and isCouncilFrameEvent /
// toCouncilFrame (client, decode side).
//
// Source of truth: every `template.streamFrame` node in the loaded MetaRoot.
// The template.streamFrame subtype is registered by wizardsofoddProvider
// (src/codegen/wizardsofodd-provider.ts), wired in metaobjects.config.ts
// via the providers: [...] field. Each streamFrame node carries:
//   @eventName  wire event name (the literal after `event: ` on the wire)
//   @payloadRef value-object whose codegen'd TS interface IS the payload type
//
// Why a new subtype (and not template.output + @eventName attr): template.output
// requires @textRef for the renderable body, and stream-frame envelopes have
// no renderable text — the wire format is `event: X\ndata: <json>`, which is
// JSON serialization, not template rendering. Same rationale as template.toolcall
// (now MO core; it too was project-local before it graduated).
//
// Demonstration value: adding a new SSE event to the council is a 2-file YAML
// drop (one payload value-object + one streamFrame node) + a regen — the
// shared CouncilFrame union, the declared-event guard and the reducer's
// exhaustiveness check all update on the next `npm run gen:db`.

import type { Generator, EmittedFile, GenContext } from "@metaobjectsdev/codegen-ts";
import { oncePerRun } from "@metaobjectsdev/codegen-ts";
import {
  stripPackage,
  TYPE_TEMPLATE,
  TEMPLATE_ATTR_PAYLOAD_REF,
} from "@metaobjectsdev/metadata";
// Read the project-local subtype + attr names through the SAME constants the
// provider registers them under — no drift between declared and read.
import { TEMPLATE_SUBTYPE_STREAM_FRAME, TEMPLATE_ATTR_EVENT_NAME } from "./wizardsofodd-provider";

interface StreamFrameSpec {
  /** YAML name (e.g. "wizardFrame"); drives the TS const + arm name. */
  name: string;
  /** Wire SSE event name (e.g. "wizard"); the literal after `event: ` on the wire. */
  eventName: string;
  /** Value-object the event carries (e.g. "WizardFramePayload"). */
  payloadRef: string;
}

function discoverStreamFrames(ctx: GenContext): StreamFrameSpec[] {
  const specs: StreamFrameSpec[] = [];
  // ADR-0039: use the RESOLVING accessors (children()/attr()) by default so an
  // abstract streamFrame + `extends` (say, to share an @eventName prefix) would
  // still resolve — the inheritance-proof pattern the upstream verify code uses
  // for @textRef/@payloadRef, no per-call-site justification needed.
  for (const child of ctx.loadedRoot.children()) {
    if (child.type !== TYPE_TEMPLATE || child.subType !== TEMPLATE_SUBTYPE_STREAM_FRAME) continue;
    const eventName = child.attr(TEMPLATE_ATTR_EVENT_NAME);
    const payloadRef = child.attr(TEMPLATE_ATTR_PAYLOAD_REF);
    if (typeof eventName !== "string" || !eventName) {
      throw new Error(`sse-frames: template.streamFrame "${child.name}" is missing required @eventName`);
    }
    if (typeof payloadRef !== "string" || !payloadRef) {
      throw new Error(`sse-frames: template.streamFrame "${child.name}" is missing required @payloadRef`);
    }
    // @payloadRef canonicalizes to a package-qualified FQN under 0.15
    // (ADR-0032/0041); strip the package for the local TS type + import path.
    specs.push({ name: child.name, eventName, payloadRef: stripPackage(payloadRef) });
  }
  // Stable order by eventName so the emitted file is byte-deterministic
  // across runs (and the union arms read alphabetically).
  specs.sort((a, b) => a.eventName.localeCompare(b.eventName));
  return specs;
}

export const sseFrames = (): Generator => ({
  name: "sse-frames",
  target: "web",
  generate: oncePerRun((_entities, ctx): EmittedFile[] => {
    const specs = discoverStreamFrames(ctx);

    // Unique payload refs for the import block. Two streamFrames sharing a
    // payload (unlikely, but allowed) share the import.
    const payloadRefs = Array.from(new Set(specs.map((s) => s.payloadRef))).sort();

    const payloadImports = payloadRefs
      .map((p) => `import type { ${p} } from "../../db/generated/${p}";`)
      .join("\n");

    // Wire event-name union: "council" | "wizard" | ...
    const eventNameUnion = specs
      .map((s) => JSON.stringify(s.eventName))
      .join(" | ");

    // The discriminated union — one arm per event, narrowing on { event }.
    const unionArms = specs
      .map(
        (s) =>
          `  | { event: ${JSON.stringify(s.eventName)}; data: ${s.payloadRef} }`,
      )
      .join("\n");

    // COUNCIL_EVENTS const map — { council: "council", wizard: "wizard", ... }.
    // It is the runtime copy of the declared event set: the client's
    // isCouncilFrameEvent guard reads it to drop events this build doesn't know.
    const eventConstEntries = specs
      .map(
        (s) =>
          `  ${s.eventName}: ${JSON.stringify(s.eventName)},`,
      )
      .join("\n");

    const header = `// @generated by @metaobjectsdev/codegen-ts (via sse-frames) — DO NOT EDIT.
// AUTO-GENERATED — re-run \`npm run gen:db\`.
// Source of truth: every template.streamFrame node under metaobjects/.
//
// CouncilFrame is the discriminated union every tier speaks: the orchestrator
// yields frames, the Worker encodes them with encodeCouncilFrame, and the
// client narrows decoded frames with toCouncilFrame before its reducer
// switches on frame.event.

${payloadImports}

export type CouncilFrameEventName = ${eventNameUnion};

export type CouncilFrame =
${unionArms};

/** The frame (or frames) for the given event name(s). */
export type CouncilFrameOf<E extends CouncilFrameEventName> = Extract<CouncilFrame, { event: E }>;

export const COUNCIL_EVENTS = {
${eventConstEntries}
} as const satisfies Record<CouncilFrameEventName, CouncilFrameEventName>;

const DECLARED_EVENTS: ReadonlySet<string> = new Set(Object.values(COUNCIL_EVENTS));

/** Encode one frame as SSE wire text: an event line, a JSON data line, a blank line. */
export function encodeCouncilFrame(frame: CouncilFrame): string {
  return \`event: \${frame.event}\\ndata: \${JSON.stringify(frame.data)}\\n\\n\`;
}

/** True when \`name\` is one of the declared stream-frame events. */
export function isCouncilFrameEvent(name: string): name is CouncilFrameEventName {
  return DECLARED_EVENTS.has(name);
}

/**
 * Narrow a decoded wire frame to CouncilFrame, or null when its event is not
 * declared (forward compatibility: a newer server may send events this client
 * doesn't know). The payload is trusted by contract — the Worker encodes every
 * frame from this same union — so this is the wire boundary, like fetch().json().
 */
export function toCouncilFrame(raw: { event: string; data: unknown }): CouncilFrame | null {
  return isCouncilFrameEvent(raw.event) ? (raw as CouncilFrame) : null;
}
`;

    // Bare filename — the engine writes it under the "web" target's outDir.
    return [{ path: "council-frames.ts", content: header }];
  }),
});
