import type { Hono } from "hono";
import { getDb } from "../db/client";
import { getCouncilWithTurns } from "../db/queries";
import { renderShareHtml } from "../render/share-html";
import { CouncilInsertSchema } from "../db/generated/Council";
import type { Env } from "../index";

// Slug validator sourced from the codegen'd Council.id Zod field. The shape
// (length + alphabet) lives in metaobjects/abstracts/meta-short-slug-field.yaml;
// `Council.id extends: shortSlug` propagates it here, so changing the alphabet
// in one place updates this guard automatically. Previously this file's regex
// (`^[a-zA-Z0-9]{8}$`) drifted from the actual generator's alphabet and
// accepted inputs the generator could never have produced.
const SLUG_VALIDATOR = CouncilInsertSchema.shape.id;
const isValidSlug = (s: string): boolean => SLUG_VALIDATOR.safeParse(s).success;

export function registerShareRoutes(app: Hono<{ Bindings: Env }>): void {
  // Order matters: register the .json variant first so its regex pattern
  // wins over the bare /c/:slug pattern.
  app.get("/c/:slug{.+\\.json}", async (c) => {
    const slugParam = c.req.param("slug");
    const slug = slugParam.replace(/\.json$/, "");
    if (!isValidSlug(slug)) return c.text("Not found", 404);
    const db = getDb(c.env);
    const data = await getCouncilWithTurns(db, slug);
    if (!data) return c.text("Not found", 404);
    return c.json(data);
  });

  app.get("/c/:slug", async (c) => {
    const slug = c.req.param("slug");
    if (!isValidSlug(slug)) return c.text("Not found", 404);
    const db = getDb(c.env);
    const data = await getCouncilWithTurns(db, slug);
    if (!data) return c.text("Not found", 404);
    const html = renderShareHtml(data);
    return c.html(html);
  });
}
