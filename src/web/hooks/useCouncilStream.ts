import { useCallback, useReducer } from "react";
import { parseSseStream, toTypedFrame } from "../lib/sse-parser";

import type { WizardOutput } from "../../db/generated/WizardOutput";
import type { VerdictOutput } from "../../db/generated/VerdictOutput";
import {
  COUNCIL_EVENTS,
  type CouncilFrame,
} from "../generated/council-frames";

// SSE event payload shapes — sourced directly from the codegen'd row types so
// the hook, the SSR share-page renderer, and the DB queries all speak the same
// shape (post the codegen-ts $type<RefName[]>() + field.enum literal patches).
export type WizardTake = WizardOutput;
export type Verdict = VerdictOutput;

export interface WizardTurn {
  kind: "wizard" | "error";
  wizardId: string;
  wizardName: string;
  take?: WizardTake;
  reason?: string;
}

export type StreamStatus = "idle" | "streaming" | "complete" | "error";

export interface StreamState {
  status: StreamStatus;
  slug: string | null;
  wizardTurns: WizardTurn[];
  verdict: Verdict | null;
  errorMessage: string | null;
}

export const initialState: StreamState = {
  status: "idle",
  slug: null,
  wizardTurns: [],
  verdict: null,
  errorMessage: null,
};

export type StreamAction =
  | { type: "frame"; frame: CouncilFrame }
  | { type: "streamError"; message: string }
  | { type: "reset" };

/** ReadonlySet of declared event names (the keys of COUNCIL_EVENTS). */
const DECLARED_EVENTS: ReadonlySet<string> = new Set(Object.values(COUNCIL_EVENTS));

export function reducer(state: StreamState, action: StreamAction): StreamState {
  if (action.type === "reset") return initialState;
  if (action.type === "streamError") {
    return { ...state, status: "error", errorMessage: action.message };
  }
  // action.type === "frame" — TS narrows action.frame to CouncilFrame, and
  // the switch on frame.event narrows action.frame.data per-arm.
  const frame = action.frame;
  switch (frame.event) {
    case "council":
      return { ...state, status: "streaming", slug: frame.data.id };
    case "wizard": {
      if (state.slug === null) return state;
      return {
        ...state,
        wizardTurns: [...state.wizardTurns, { kind: "wizard", wizardId: frame.data.wizardId, wizardName: frame.data.wizardName, take: frame.data.take }],
      };
    }
    case "error": {
      if (state.slug === null) return state;
      return {
        ...state,
        wizardTurns: [...state.wizardTurns, { kind: "error", wizardId: frame.data.wizardId, wizardName: frame.data.wizardName, reason: frame.data.reason }],
      };
    }
    case "verdict": {
      if (state.slug === null) return state;
      return { ...state, verdict: frame.data.verdict };
    }
    case "done":
      return { ...state, status: "complete" };
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
      const payload: { question: string; cfTurnstileToken: string; wizardIds?: string[] } = {
        question,
        cfTurnstileToken: turnstileToken,
      };
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
        const typed = toTypedFrame(raw, DECLARED_EVENTS);
        if (typed === null) continue; // forward-compat: skip unknown events
        dispatch({ type: "frame", frame: typed });
      }
    } catch (err) {
      dispatch({ type: "streamError", message: (err as Error).message ?? "Stream failed" });
    }
  }, []);

  return { state, start };
}
