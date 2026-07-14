import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

/**
 * Vitest resolves the `@dg/*` workspace packages via explicit aliases so tests
 * (and the code under test) load the TypeScript sources directly — no build
 * step, no npm-workspace symlinks required in CI. The regex aliases map the
 * ESM `.js` import specifiers onto their `.ts` sources; bare specifiers hit the
 * package barrels. Keep in sync with tsconfig.json "paths".
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@dg\/domain\/(.*)\.js$/, replacement: `${root}packages/domain/src/$1.ts` },
      { find: /^@dg\/engine\/(.*)\.js$/, replacement: `${root}packages/engine/src/$1.ts` },
      { find: /^@dg\/core\/(.*)\.js$/, replacement: `${root}packages/core/src/$1.ts` },
      { find: /^@dg\/connectors\/(.*)\.js$/, replacement: `${root}packages/connectors/src/$1.ts` },
      { find: /^@dg\/workspace-local\/(.*)\.js$/, replacement: `${root}packages/workspace-local/src/$1.ts` },
      { find: /^@dg\/cli\/(.*)\.js$/, replacement: `${root}packages/cli/src/$1.ts` },
      { find: "@dg/domain", replacement: `${root}packages/domain/src/index.ts` },
      { find: "@dg/engine", replacement: `${root}packages/engine/src/index.ts` },
      { find: "@dg/core", replacement: `${root}packages/core/src/index.ts` },
      { find: "@dg/connectors", replacement: `${root}packages/connectors/src/index.ts` },
      { find: "@dg/workspace-local", replacement: `${root}packages/workspace-local/src/index.ts` },
      { find: "@dg/cli", replacement: `${root}packages/cli/src/index.ts` },
      { find: /^@dg\/mcp\/(.*)\.js$/, replacement: `${root}packages/mcp/src/$1.ts` },
      { find: "@dg/mcp", replacement: `${root}packages/mcp/src/index.ts` },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "packages/**/*.test.ts"],
  },
});
