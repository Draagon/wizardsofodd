import type { Context } from "hono";
import { Hono } from "hono";
import { convene } from "./council/orchestrator";
import { selectRegistry } from "./council/registry-selection";
import { WIZARD_REGISTRY } from "./personas/generated/registry";
import { search } from "./llm/web-search";
import { checkAndCount, checkAndCountIp } from "./middleware/rateLimit";
import { verifyTurnstile } from "./middleware/turnstile";
import { getDb } from "./db/client";
import {
  insertCouncil,
  recordWizardTurn,
  recordErrorTurn,
  finalizeCouncil,
  setCouncilError,
} from "./db/queries";
import { registerShareRoutes } from "./handlers/share";
import {
  sseFrame,
  COUNCIL_EVENTS,
  type CouncilFrameEventName,
  type CouncilFrameByEventName,
} from "./web/generated/council-frames";

export interface Env {
  ASSETS: Fetcher;
  RATE_LIMIT: KVNamespace;
  DB: D1Database;
  ANTHROPIC_API_KEY: string;
  MODEL: string;
  MAX_QUESTIONS_PER_DAY: string;
  GLOBAL_MAX_PER_DAY: string;
  KILL_SWITCH: string;
  IP_MAX_PER_DAY: string;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET: string;
  SEARCH_URL: string;
  /** Optional CF Access service-token credentials so the Worker can reach a CF-Access-protected search endpoint. */
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;
}

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ ok: true }));

// Thin alias over the codegen'd sseFrame so the call sites read naturally
// (`sse(...)`) while the wire shape stays driven by metaobjects/sse-frames/.
function sse<E extends CouncilFrameEventName>(event: E, data: CouncilFrameByEventName[E]): string {
  return sseFrame(event, data);
}

// Pull the woo_vid value out of a Cookie header that may contain other cookies,
// e.g. "a=b; woo_vid=...; c=d".
function readVisitorId(cookieHeader: string | undefined | null): string | null {
  if (!cookieHeader) return null;
  const m = cookieHeader.match(/(?:^|;\s*)woo_vid=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

const RATE_LIMIT_MESSAGES: Record<string, string> = {
  killswitch: "The Guild has closed its doors for now.",
  global: "The Guild is overwhelmed today; return tomorrow.",
  visitor: "You have asked the Guild enough for one day. Return tomorrow.",
  ip: "This dwelling has consulted the Guild enough today.",
  turnstile: "The Guild requires proof you are not a ghost.",
};

// ---------------------------------------------------------------------------
// Gate helper for POST /api/council.
// Runs Turnstile verify → IP cap → visitor cookie + visitor/global rate-limit.
// Returns { ok: true, visitorId, setCookie? } or { ok: false, response }.
// ---------------------------------------------------------------------------
type GateOk = { ok: true; visitorId: string; setCookie?: string };
type GateFail = { ok: false; response: Response };
type GateResult = GateOk | GateFail;

async function runGates(
  c: Context<{ Bindings: Env }>,
  cfTurnstileToken: string | undefined,
  clientIp: string | undefined,
): Promise<GateResult> {
  // Turnstile gate — first, because it's free for us and rejects the cheapest-
  // to-detect attacks before we spend any KV reads or LLM calls. Fail-closed:
  // any error during verification → 429.
  const turnstileOk = await verifyTurnstile({
    token: cfTurnstileToken ?? "",
    secret: c.env.TURNSTILE_SECRET,
    remoteIp: clientIp,
  });
  if (!turnstileOk) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: RATE_LIMIT_MESSAGES.turnstile }), {
        status: 429,
        headers: { "content-type": "application/json; charset=utf-8" },
      }),
    };
  }

  // IP gate — defeats the "clear cookies + curl loop" pattern that the visitor
  // cap alone cannot. Fail-OPEN on missing header: losing cf-connecting-ip
  // would block 100% of traffic; the visitor + global caps remain as backstops.
  if (clientIp) {
    const ipOk = await checkAndCountIp(
      c.env.RATE_LIMIT,
      clientIp,
      parseInt(c.env.IP_MAX_PER_DAY || "10", 10),
    );
    if (!ipOk) {
      return {
        ok: false,
        response: new Response(JSON.stringify({ error: RATE_LIMIT_MESSAGES.ip }), {
          status: 429,
          headers: { "content-type": "application/json; charset=utf-8" },
        }),
      };
    }
  }

  // Identify the visitor by the woo_vid cookie; mint a fresh one when absent so
  // the per-visitor cap can track a person across requests.
  let visitorId = readVisitorId(c.req.header("cookie"));
  let setCookie: string | undefined;
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    setCookie = `woo_vid=${visitorId}; Path=/; Max-Age=31536000; SameSite=Lax; Secure; HttpOnly`;
  }

  const limit = await checkAndCount(c.env.RATE_LIMIT, visitorId, {
    perVisitorPerDay: parseInt(c.env.MAX_QUESTIONS_PER_DAY || "5", 10),
    globalPerDay: parseInt(c.env.GLOBAL_MAX_PER_DAY || "200", 10),
    killSwitch: c.env.KILL_SWITCH || "off",
  });
  if (!limit.allowed) {
    const reason = limit.reason ?? "visitor";
    const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
    if (setCookie) headers.set("set-cookie", setCookie);
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: RATE_LIMIT_MESSAGES[reason] ?? RATE_LIMIT_MESSAGES.visitor }),
        { status: 429, headers },
      ),
    };
  }

  return { ok: true, visitorId, setCookie };
}

app.post("/api/council", async (c) => {
  const body = await c.req
    .json<{ question?: string; cfTurnstileToken?: string; wizardIds?: string[] }>()
    .catch(() => ({}) as { question?: string; cfTurnstileToken?: string; wizardIds?: string[] });
  const question = (body.question ?? "").trim();
  const wizardIds = Array.isArray(body.wizardIds)
    ? body.wizardIds.filter((x): x is string => typeof x === "string")
    : undefined;
  if (!question) return c.json({ error: "Pose a question to the Guild." }, 400);
  if (question.length > 600) return c.json({ error: "Brevity, mortal. Keep it under 600 characters." }, 400);

  const clientIp = c.req.header("cf-connecting-ip") ?? undefined;
  const gate = await runGates(c, body.cfTurnstileToken, clientIp);
  if (!gate.ok) return gate.response;
  const { visitorId, setCookie } = gate;

  const apiKey = c.env.ANTHROPIC_API_KEY;
  const model = c.env.MODEL || "claude-sonnet-4-6";

  const db = getDb(c.env);
  const slug = await insertCouncil(db, { visitorId, question });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(sse(COUNCIL_EVENTS.council, { id: slug })));
      try {
        const searchClient = (q: string) => search({
          query: q,
          searchUrl: c.env.SEARCH_URL,
          cfAccessClientId: c.env.CF_ACCESS_CLIENT_ID,
          cfAccessClientSecret: c.env.CF_ACCESS_CLIENT_SECRET,
        });
        let ordinal = 0;
        const registry = selectRegistry(WIZARD_REGISTRY, wizardIds);
        for await (const ev of convene({ question, apiKey, model, search: searchClient, registry })) {
          if (ev.type === "wizard") {
            ordinal += 1;
            await recordWizardTurn(db, slug, {
              ordinal,
              wizardId: ev.wizardId,
              wizardName: ev.wizardName,
              take: ev.take,
            });
            controller.enqueue(encoder.encode(sse(COUNCIL_EVENTS.wizard, {
              wizardId: ev.wizardId,
              wizardName: ev.wizardName,
              take: ev.take,
            })));
          } else if (ev.type === "error") {
            ordinal += 1;
            await recordErrorTurn(db, slug, {
              ordinal,
              wizardId: ev.wizardId,
              wizardName: ev.wizardName,
              reason: ev.reason,
            });
            controller.enqueue(encoder.encode(sse(COUNCIL_EVENTS.error, {
              wizardId: ev.wizardId,
              wizardName: ev.wizardName,
              reason: ev.reason,
            })));
          } else if (ev.type === "verdict") {
            await finalizeCouncil(db, slug, ev.verdict);
            controller.enqueue(encoder.encode(sse(COUNCIL_EVENTS.verdict, { verdict: ev.verdict })));
          }
        }
      } catch (err) {
        console.error("[council] stream error", err);
        await setCouncilError(db, slug);
        // ErrorFramePayload requires wizardId/wizardName/reason — the catastrophic
        // stream-level failure path uses sentinel values so the wire shape stays
        // consistent with per-wizard errors and the React reducer doesn't need a
        // separate code path.
        controller.enqueue(encoder.encode(sse(COUNCIL_EVENTS.error, {
          wizardId: "_stream",
          wizardName: "The Guild",
          reason: "The tower went dark unexpectedly.",
        })));
      } finally {
        controller.enqueue(encoder.encode(sse(COUNCIL_EVENTS.done, { ok: true })));
        controller.close();
      }
    },
  });

  const headers = new Headers({
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
  });
  // Set the cookie directly on the raw streamed Response so it round-trips to the
  // browser; relying on c.header(...) here would not survive on this Response.
  if (setCookie) headers.set("set-cookie", setCookie);

  return new Response(stream, { headers });
});

registerShareRoutes(app);

export default app;
