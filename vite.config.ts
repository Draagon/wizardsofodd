import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// public/styles.css is the single hand-curated stylesheet, served as a static
// asset (and linked directly by the SSR share pages in src/render/share-html.ts).
// The SPA shell links it via the absolute `<link href="/styles.css">` in
// src/web/index.html, which Vite passes through to the build output verbatim
// (absolute URLs are not resolved or bundled) — so no injection plugin is needed.
//
// Root: src/web — that's where index.html lives.
// publicDir: false — we manage public/ as the Workers static-assets dir; Vite
// shouldn't copy a separate public dir into the build output.
// outDir: ../../public — Vite emits the built shell + bundle alongside the
// hand-curated assets in public/.
// emptyOutDir: false — load-bearing. If true, Vite wipes public/ (including
// portraits, styles.css, favicons).
// rollupOptions.input: explicit so Vite can find src/web/index.html as the entry.

export default defineConfig({
  plugins: [react()],
  root: "src/web",
  publicDir: false,
  build: {
    outDir: "../../public",
    emptyOutDir: false,
    rollupOptions: {
      input: "src/web/index.html",
    },
  },
});
