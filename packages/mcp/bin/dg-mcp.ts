#!/usr/bin/env node
/**
 * dg-mcp entrypoint (stdio). In development run via tsx:
 *   npm run dg-mcp
 *
 * Phase 3.1 foundation: bootstraps the server and reports readiness. Transport
 * wiring (StdioServerTransport) arrives in Phase 3.2.
 */
import { main } from "../src/server.js";

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
