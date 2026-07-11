# 0000 — Using Architecture Decision Records

**Status:** Accepted
**Date:** 2026-05-25

## Context

This project has accumulated a number of consequential architectural decisions
(infra choice, persistence design, image-gen pipeline, search auth, talents
shape, ...) that aren't obviously self-documenting from the code. When someone
revisits the codebase in three months — the maintainer, an assistant, or a future
contributor — they'll want to know *why* a choice was made, not just *what* it was.

Per-feature design docs lived in an internal planning tree; the ADRs here carry
the durable, cross-cutting "why this trade-off" decisions. Feature-level detail
lives in code comments and the `metaobjects/` metadata itself.

## Decision

Use lightweight [Architecture Decision Records (Michael Nygard format)](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
under `docs/adr/`. One file per decision. Filename pattern: `NNNN-short-title.md`,
numbered sequentially.

Each ADR has four sections:
- **Status** — Proposed / Accepted / Superseded by ADR-NNNN / Deprecated
- **Context** — what problem or fork in the road we were facing
- **Decision** — what we chose and (when relevant) the load-bearing details
- **Consequences** — what we get from this choice and what we give up

ADRs are append-only history. When a decision is reversed or supersedes
another, we mark the old one **Superseded by ADR-NNNN** rather than editing
its substance. The trail is the point.

## When to write one

Write a new ADR when a decision:
- Affects more than one file or contract
- Trades off two genuinely defensible options
- Took non-obvious reasoning to settle
- Would be costly to reverse silently

Don't write ADRs for:
- Implementation details (use code comments)
- Per-feature design specs (they live outside this repo)
- One-shot tactical choices

## Consequences

**+** Future-you can read the chronological list of ADRs and reconstruct the
load-bearing decisions without spelunking commits.

**+** When a decision feels wrong later, you have a written record of the
context that drove it — easier to evaluate whether the context still holds.

**-** Mild discipline tax — every consequential decision now needs ~15 minutes
of writing. Worth it; lighter than spec docs.

**-** ADRs go stale if not maintained. Mitigation: when a decision is reversed,
add the superseding ADR rather than rewriting the old one.

## Index

The numbered list of ADRs in this directory is the index. As of writing:

| # | Title | Status |
|---|---|---|
| 0001 | [Cloudflare Workers + Static Assets as the whole stack](./0001-cloudflare-workers-stack.md) | Accepted |
| 0002 | [D1 + MetaObjects codegen for persistence](./0002-d1-and-metaobjects-codegen.md) | Accepted (Phase 2 paused) |
| 0003 | [Local ComfyUI for dev image generation](./0003-comfyui-for-dev-image-gen.md) | Accepted |
| 0004 | [SearXNG via CF Access service token for Lorekeeper's RAG](./0004-searxng-via-cf-access.md) | Accepted |
| 0005 | [Wizard talents — per-wizard technique + shared sources](./0005-wizard-talents.md) | Accepted |
| 0006 | [4-point calibrated verdict synthesis](./0006-verdict-synthesis.md) | Accepted |
| 0007 | [Anonymous-first with woo_vid cookie continuity](./0007-anonymous-first.md) | Accepted |
