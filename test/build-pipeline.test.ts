import { describe, it, expect } from "vitest";

// These files are hand-curated assets that MUST survive every `vite build`
// (Vite is configured with emptyOutDir: false so it doesn't wipe public/).
// If this test fails, someone enabled emptyOutDir or deleted a portrait.
//
// We rely on Vite's `import.meta.glob`, which is resolved by the Vite
// transform *outside* the Workers runtime — so it works even though the
// `node:fs` shim inside the cloudflare:test pool can't see the real disk.
const PORTRAITS = import.meta.glob("/public/portraits/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;
const ROOT_ASSETS = import.meta.glob("/public/{background.webp,styles.css}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const SENTINELS = [
  "/public/portraits/grumbel.webp",
  "/public/portraits/lorekeeper.webp",
  "/public/portraits/ozzimandias.webp",
  "/public/portraits/pib.webp",
  "/public/portraits/vexil.webp",
  "/public/portraits/verdict-seal.webp",
  "/public/background.webp",
  "/public/styles.css",
];

describe("public/ sentinel files (Vite emptyOutDir:false guard)", () => {
  const matched = { ...PORTRAITS, ...ROOT_ASSETS };
  for (const path of SENTINELS) {
    it(`${path} exists`, () => {
      expect(matched).toHaveProperty(path);
    });
  }
});
