# 0007 — Anonymous-first with woo_vid cookie continuity

**Status:** Accepted
**Date:** 2026-05-23

## Context

A consumer-facing AI toy needs *some* notion of "the same visitor over time"
so per-visitor rate limits actually limit a person rather than a request,
and so future features (Phase 4 per-visitor memory) can attach to a stable
identifier.

Three real options:

| | Pros | Cons |
|---|---|---|
| Full account system | Stable identity; cross-device; clear UX for the user; standard pattern | Real implementation cost; password/OAuth; password reset; email verification; database table; account abandonment | 
| OAuth-only (Google sign-in) | Skip password handling; lower friction than email/password | Still implements identity; needs OAuth client setup; Google dependency; users without Google accounts excluded |
| **Anonymous cookie** | Zero friction; nothing to set up; no PII; just works | Per-device, not per-person; expires/cleared loses continuity; no recovery |

For an entertainment toy where "remember this is the same visitor" is the
*only* identity need, accounts are massively overscoped.

## Decision

**Anonymous-first.** The Worker sets a `woo_vid` cookie on the visitor's
first request: `crypto.randomUUID()`, `Path=/; Max-Age=31536000;
SameSite=Lax; Secure; HttpOnly`. The cookie is the visitor's identity for
all purposes:

- **Rate limiting** — `RATE_LIMIT` KV counters are keyed by visitor cookie
  (per-day per-visitor cap, plus a global daily cap, plus a kill-switch).
- **Persistence (Phase 2)** — every council row stores its visitor_id so
  abuse cleanup ("delete all councils from this visitor_id") is possible.
  The visitor_id is never rendered on the public share page; the URL is the
  access token.
- **Future memory (Phase 4)** — Draagon's episodic memory layer will key off
  the same visitor_id, so wizards can remember the visitor's prior questions.

The cookie is set on **both** the 429 response AND the streaming 200
`Response` headers — critical, because Hono's `c.header()` doesn't reliably
attach to a raw `new Response(stream, ...)`. The fix: build a `new Headers()`
object explicitly and pass it to both response paths.

## Consequences

**+** Zero friction. New visitors get the same experience as repeat ones;
nothing to sign up for, nothing to remember.

**+** No PII in the system. The visitor_id is a random UUID; no email, no
name, no IP stored long-term. The cookie itself is `HttpOnly` so JavaScript
can't read it.

**+** Rate limits genuinely limit a person (on one device) rather than
limiting requests-from-an-IP.

**+** Phase 2 sharing works without accounts — the unguessable slug in the
share URL IS the access token. Anyone with the link can view the council.

**+** Forward-compatible with Phase 4 memory without changing the data model.

**-** Per-device, not per-person. A visitor who comes back on their phone is
a different visitor as far as the system is concerned. Acceptable for v1; if
account-creation ever happens (probably never for this toy), accounts would
upgrade by claiming all the cookie's prior visitor_ids.

**-** Cleared cookies = lost continuity. Visitor's "previously asked"
history would vanish. Acceptable for a stateless toy; would matter more if
we ever shipped Phase 4 memory.

**-** Adding accounts later is a meaningful project (account model, login
flow, cookie-to-account migration). Phase-1 design accepts this future cost
in exchange for present simplicity.
