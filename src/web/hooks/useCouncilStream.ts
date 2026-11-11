import { useCallback, useReducer } from "react";
import { parseSseStream } from "../lib/sse-parser";

import type { VerdictOutput } from "../../db/generated/VerdictOutput";
import type { CouncilRequest } from "../../db/generated/CouncilRequest";
import type { WizardFramePayload } from "../../db/generated/WizardFramePayload";
import type { ErrorFramePayload } from "../../db/generated/ErrorFramePayload";
import { COUNCIL_EVENTS, toCouncilFrame, type CouncilFrame } from "../generated/council-frames";

// SSE event payload shapes — sourced directly from the codegen'd types so the
// hook, the SSR share-page renderer, and the DB queries all speak the same shape.
export type Verdict = VerdictOutput;

/** One council turn as the UI renders it: a `wizard` or `error` frame's payload, tagged by its frame's event. */
export type WizardTurn =
  | ({ kind: typeof COUNCIL_EVENTS.wizard } & WizardFramePayload)
  | ({ kind: typeof COUNCIL_EVENTS.error } & ErrorFramePayload);

/** The stream's UI state. Not a model enum: it tracks the request, not the council. */
export const STREAM_STATUS = {
  idle: "idle",
  streaming: "streaming",
  complete: "complete",
  error: "error",
} as const;
export type StreamStatus = (typeof STREAM_STATUS)[keyof typeof STREAM_STATUS];

export interface StreamState {
  status: StreamStatus;
  slug: string | null;
  wizardTurns: WizardTurn[];
  verdict: Verdict | null;
  errorMessage: string | null;
}

export const initialState: StreamState = {
  status: STREAM_STATUS.idle,
  slug: null,
  wizardTurns: [],
  verdict: null,
  errorMessage: null,
};

export type StreamAction =
  | { type: "frame"; frame: CouncilFrame }
  | { type: "streamError"; message: string }
  | { type: "reset" };

export function reducer(state: StreamState, action: StreamAction): StreamState {
  if (action.type === "reset") return initialState;
  if (action.type === "streamError") {
    return { ...state, status: STREAM_STATUS.error, errorMessage: action.message };
  }
  // action.type === "frame" — TS narrows action.frame to CouncilFrame, and
  // the switch on frame.event narrows action.frame.data per-arm.
  const frame = action.frame;
  switch (frame.event) {
    case COUNCIL_EVENTS.council:
      return { ...state, status: STREAM_STATUS.streaming, slug: frame.data.id };
    case COUNCIL_EVENTS.wizard: {
      if (state.slug === null) return state;
      return {
        ...state,
        wizardTurns: [...state.wizardTurns, { kind: frame.event, ...frame.data }],
      };
    }
    case COUNCIL_EVENTS.error: {
      if (state.slug === null) return state;
      return {
        ...state,
        wizardTurns: [...state.wizardTurns, { kind: frame.event, ...frame.data }],
      };
    }
    case COUNCIL_EVENTS.verdict: {
      if (state.slug === null) return state;
      return { ...state, verdict: frame.data.verdict };
    }
    case COUNCIL_EVENTS.done:
      return { ...state, status: STREAM_STATUS.complete };
    default: {
      // Exhaustiveness check — if a new event is added to the codegen'd union
      // without a reducer case, TS flags this branch.
      const _exhaustive: never = frame;
      void _exhaustive;
      return state;
    }
  }
}

export function useCouncilStream() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const start = useCallback(async (question: string, turnstileToken: string, wizardIds?: string[]) => {
    dispatch({ type: "reset" });
    try {
      const payload: CouncilRequest = { question, cfTurnstileToken: turnstileToken };
      if (wizardIds && wizardIds.length > 0) payload.wizardIds = wizardIds;
      const res = await fetch("/api/council", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok || !res.body) {
        dispatch({ type: "streamError", message: `Council failed: HTTP ${res.status}` });
        return;
      }
      for await (const raw of parseSseStream(res.body)) {
        const frame = toCouncilFrame(raw);
        if (frame === null) continue; // forward-compat: skip unknown events
        dispatch({ type: "frame", frame });
      }
    } catch (err) {
      dispatch({ type: "streamError", message: (err as Error).message ?? "Stream failed" });
    }
  }, []);

  return { state, start };
}
