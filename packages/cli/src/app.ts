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

Setup
  init            Initialize a local workspace (.decisiongraph/)
  connect github  Configure the GitHub connector (PAT)
  workspace       list | show | switch | current

Pipeline
  ingest [source] Synchronize a connector into the workspace
  extract         Extract decisions   (--component <Name>)
  graph           Build/rebuild the Decision Graph   (--no-link)
  analyze         ingest → extract → graph → link, then a summary

Reasoning
  ask [question]  Ask the Decision Graph (interactive if omitted)
  replay --run    Replay a recorded run
  export          Export graph: --format json|graphml|mermaid [--out file]

Diagnostics
  doctor          Workspace / connector / cache / engine health

Global options
  --repo <o/n>    Target repository / workspace
  --json          Machine-readable output (progress → stderr)
  --no-color      Disable ANSI color
  --resume        Resume a cancelled run (with --run <id>)
  --help, --version`;

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
