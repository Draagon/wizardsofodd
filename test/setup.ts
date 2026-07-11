import { env } from "cloudflare:test";
import { beforeAll } from "vitest";

// Single source of truth for the test D1 schema: replay the REAL migration
// files against it. Vite inlines `?raw` imports at build time, so this works in
// the workerd test pool (which has no filesystem). No more hand-mirrored
// SCHEMA_SQL to drift from migrations/ — a new migration is picked up
// automatically. See docs/runbook.md.
const migrationFiles = import.meta.glob("../migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

// Apply in filename order (0001, 0002, 0003, …), splitting each file into
// individual statements (our migrations use `;`-terminated statements with no
// embedded semicolons) and stripping `--` comment lines.
const statements: string[] = Object.keys(migrationFiles)
  .sort()
  .flatMap((path) =>
    migrationFiles[path]
      // Strip `--` comment lines FIRST, then split — so a `;` inside a comment
      // can't break a statement boundary.
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .split(";")
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt.length > 0),
  );

beforeAll(async () => {
  for (const stmt of statements) {
    await env.DB.prepare(stmt).run();
  }
});
