/**
 * dg — dispatcher. Parses argv, builds the context, routes to one command,
 * and renders errors gracefully. Wires SIGINT to cooperative cancellation.
 */

import { buildContext, CLI_VERSION, type BuildOptions, type Ctx } from "./context.js";
import { COMMANDS } from "./commands.js";
import { CliError } from "./errors.js";
import { bool } from "./args.js";
import { fail, jsonOut, line, warn } from "./render/output.js";
import type { IO } from "./io.js";

const USAGE = `dg — Decision Graph CLI (v${CLI_VERSION})

Usage: dg <command> [options]

Quick start:
  1. cp .env.example .env          set ANTHROPIC_API_KEY + GITHUB_TOKEN
  2. npm run dg -- doctor          verify setup
  3. npm run dg -- init --repo o/n initialize workspace
  4. npm run dg -- connect github  connect GitHub (PAT)
  5. npm run dg -- analyze --component Name  full pipeline
  6. npm run dg -- ask "..."       ask the graph a question

Setup
  init --repo <o/n>  Initialize a local workspace (.decisiongraph/)
  connect github     Configure the GitHub connector (PAT)
  workspace          list | show | switch | current

Pipeline
  ingest [source]    Synchronize a connector into workspace
  extract           Extract decisions (--component <Name>)
  graph              Build/rebuild the Decision Graph (--no-link)
  analyze           ingest → extract → graph → link (--component <Name>)

Reasoning
  ask [question]     Ask the Decision Graph (interactive if omitted)
  replay --run <id>  Replay a recorded run
  export [format]    Export graph: json|graphml|mermaid [--out file]

Diagnostics
  doctor             Workspace / connector / cache / engine health

Global options
  --repo <o/n>       Target repository / workspace
  --json             Machine-readable output (progress → stderr)
  --no-color         Disable ANSI color
  --resume [--run]   Resume a cancelled run
  --help, --version

Environment:
  ANTHROPIC_API_KEY  Required  Anthropic API key
  GITHUB_TOKEN       Required  GitHub PAT (public_repo scope)
  DG_MODEL           Optional  Model override (default: claude-sonnet-4-5)
  DG_TOOL_BUDGET     Optional  Max tool calls (default: 25)`;

function printHelp(io: IO): void {
  io.stdout(USAGE + "\n");
}

function renderError(ctx: Ctx, e: unknown): number {
  if (e instanceof CliError) {
    if (ctx.json) jsonOut(ctx.io, { error: e.message, kind: e.kind });
    else if (e.kind === "usage") warn(ctx.io, ctx.s, e.message);
    else fail(ctx.io, ctx.s, e.message);
    return e.exitCode;
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (ctx.json) jsonOut(ctx.io, { error: msg });
  else fail(ctx.io, ctx.s, msg);
  return 1;
}

export async function run(argv: string[], o: BuildOptions = {}): Promise<number> {
  const controller = new AbortController();
  const useSig = !o.signal && typeof process !== "undefined" && typeof process.on === "function";
  const onSig = (): void => controller.abort();
  if (useSig) process.on("SIGINT", onSig);

  const ctx = buildContext(argv, { ...o, signal: o.signal ?? controller.signal });
  try {
    const cmd = ctx.args.positionals[0];
    if (!cmd || cmd === "help" || bool(ctx.args, "help")) {
      printHelp(ctx.io);
      return 0;
    }
    if (cmd === "version" || bool(ctx.args, "version")) {
      ctx.io.stdout(`dg ${CLI_VERSION}\n`);
      return 0;
    }
    const handler = COMMANDS[cmd];
    if (!handler) {
      if (ctx.json) jsonOut(ctx.io, { error: `Unknown command: ${cmd}` });
      else {
        fail(ctx.io, ctx.s, `Unknown command: ${cmd}`);
        line(ctx.io);
        printHelp(ctx.io);
      }
      return 2;
    }
    return await handler(ctx);
  } catch (e) {
    return renderError(ctx, e);
  } finally {
    if (useSig) process.removeListener("SIGINT", onSig);
  }
}
