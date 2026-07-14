#!/usr/bin/env node
/**
 * dg-mcp entrypoint (stdio). In development run via tsx:
 *   npm run dg-mcp [--help]
 *
 * Starts an MCP server listening on stdin/stdout.
 */
import { main } from "../src/server.js";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(`dg-mcp — Decision Graph MCP Server

Usage:  npm run dg-mcp     (stdio transport)

The server exposes 11 tools and 5 resources over the Model Context Protocol.
Connect any MCP-compatible client (Claude Desktop, Cursor, OpenCode, etc.).

Environment:
  ANTHROPIC_API_KEY  Required  Anthropic API key for LLM calls
  GITHUB_TOKEN       Required  GitHub PAT (public_repo scope)
  DG_DATA_DIR        Optional  Workspace path (default: ./.decisiongraph/)
  DG_MODEL           Optional  LLM model override

Tools:
  dg_doctor          Workspace / connector / token / cache / engine health
  dg_ingest          Synchronize connector into workspace
  dg_extract         Extract decisions   --components <Name>
  dg_graph           Build decision graph
  dg_link            Link decisions (SUPERSEDES / INFORMS)
  dg_analyze         Full pipeline: ingest → extract → graph → link
  dg_evaluate        Evaluate ground-truth coverage for a component
  dg_ask             Ask the Decision Graph a question
  dg_counterfactual  Ask a counterfactual ("what if") question
  dg_export          Export graph (json | graphml | mermaid)
  dg_replay          Replay a previous run

Resources:
  decisiongraph://workspace/current
  decisiongraph://sync
  decisiongraph://graph
  decisiongraph://decisions
  decisiongraph://runs

See docs/MCP.md for client configuration examples.
`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
