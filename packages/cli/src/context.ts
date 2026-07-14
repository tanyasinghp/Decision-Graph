/**
 * Context — wires the CLI to the platform.
 *
 * The CLI depends on ONLY two things from the platform: DecisionGraphEngine and
 * a WorkspaceProvider. The connector registry (GitHubConnector) is composition-
 * root wiring that belongs here, at the edge — never inside a command.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { DecisionGraphEngine, type Workspace, type WorkspaceProvider } from "@dg/core";
import { createLocalProvider } from "@dg/workspace-local";
import { defaultIO, styler, type IO, type Styler } from "./io.js";
import { parseArgs, flag, bool, type ParsedArgs } from "./args.js";
import { UsageError } from "./errors.js";

export const WORKSPACE_DIR = ".decisiongraph";
export const CLI_VERSION = "0.1.0";

export interface Ctx {
  io: IO;
  s: Styler;
  json: boolean;
  args: ParsedArgs;
  provider: WorkspaceProvider;
  engine: DecisionGraphEngine;
  dataDir: string;
  ref: string | undefined;
  signal: AbortSignal;
}

export interface BuildOptions {
  io?: IO;
  provider?: WorkspaceProvider;
  engine?: DecisionGraphEngine;
  signal?: AbortSignal;
}

export function defaultProvider(dataDir: string): WorkspaceProvider {
  return createLocalProvider(dataDir);
}

function readRef(dataDir: string): string | undefined {
  const f = path.join(dataDir, "config.json");
  if (!fs.existsSync(f)) return undefined;
  try {
    return (JSON.parse(fs.readFileSync(f, "utf8")) as { repo?: string }).repo;
  } catch {
    return undefined;
  }
}

export function buildContext(argv: string[], o: BuildOptions = {}): Ctx {
  const args = parseArgs(argv);
  const io = o.io ?? defaultIO({ color: bool(args, "no-color") ? false : undefined });
  const dataDir = path.resolve(flag(args, "cwd") ?? io.cwd, flag(args, "data-dir") ?? WORKSPACE_DIR);
  return {
    io,
    s: styler(io.color),
    json: bool(args, "json"),
    args,
    provider: o.provider ?? defaultProvider(dataDir),
    engine: o.engine ?? new DecisionGraphEngine(),
    dataDir,
    ref: flag(args, "workspace") ?? flag(args, "repo") ?? readRef(dataDir),
    signal: o.signal ?? new AbortController().signal,
  };
}

/** Resolve the active workspace, or fail with an actionable usage error. */
export async function resolveWorkspace(ctx: Ctx): Promise<Workspace> {
  if (!ctx.ref) {
    throw new UsageError("No workspace selected. Run `dg init --repo <owner/name>`, or pass --repo <owner/name>.");
  }
  return ctx.provider.resolve(ctx.ref);
}
