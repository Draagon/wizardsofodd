import { defineConfig } from "vitest/config";

// Workspace-mode root: Vitest 4 replaced the standalone `vitest.workspace.ts`
// auto-loader with a `test.projects` field inside the root config. Each child
// config preserves its own runtime — `vitest.config.workers.ts` runs in the
// Cloudflare Workers pool (`workerd`); `vitest.config.web.ts` runs in jsdom
// for React component tests that need a DOM. The inline `codegen` project runs
// the build-time generators (src/codegen) in plain Node, where `meta gen` runs them.
export default defineConfig({
  test: {
    projects: [
      "./vitest.config.workers.ts",
      "./vitest.config.web.ts",
      { test: { name: "codegen", environment: "node", include: ["test/codegen/**/*.test.ts"] } },
    ],
  },
});
