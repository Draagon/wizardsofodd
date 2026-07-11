import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

// vitest-pool-workers@0.16 dropped the `defineWorkersConfig` /config subpath
// in favor of a Vite plugin (`cloudflareTest`) wired into a normal Vitest
// config. The plugin reads `wrangler.jsonc` for bindings; the `miniflare` block
// below adds TEST-ONLY env so `npm test` is self-contained — it does NOT depend
// on a local `.dev.vars` (which is gitignored, so a fresh clone wouldn't have it).
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          // Activates verifyTurnstile's bypass (secret === TEST_BYPASS_TURNSTILE),
          // so the council endpoint's fail-closed Turnstile gate passes in tests.
          TURNSTILE_SECRET: "TEST_BYPASS_TURNSTILE",
          // Placeholder — the tests mock the Anthropic fetch, so no real key is used.
          ANTHROPIC_API_KEY: "sk-ant-test-placeholder",
        },
      },
    }),
  ],
  test: {
    name: "workers",
    setupFiles: ["./test/setup.ts"],
    exclude: ["test/web/**", "node_modules/**"],
  },
});
