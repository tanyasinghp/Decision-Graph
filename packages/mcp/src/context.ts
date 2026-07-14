/**
 * Context — wires the MCP server to the platform.
 *
 * Exactly like the CLI's context, the MCP server depends on ONLY two things
 * from the platform: DecisionGraphEngine and a WorkspaceProvider. The connector
 * registry (GitHubConnector) is composition-root wiring that belongs here, at
 * the edge — never inside a tool or resource handler.
 *
 * Dependency rule (Phase 3.1): @dg/mcp → @dg/core, @dg/workspace-local,
 * @dg/connectors. Nothing else. No engine internals.
 */

import * as path from "node:path";
import { DecisionGraphEngine, type Workspace, type WorkspaceProvider } from "@dg/core";
import { createLocalProvider } from "@dg/workspace-local";

export const MCP_VERSION = "0.1.0";
export const SERVER_NAME = "decision-graph";
export const WORKSPACE_DIR = ".decisiongraph";

export interface McpContext {
  provider: WorkspaceProvider;
  engine: DecisionGraphEngine;
  /** Default data directory (workspace root) for this server instance. */
  dataDir: string;
}

export interface BuildContextOptions {
  /** Override the workspace root. Defaults to $DG_DATA_DIR or <cwd>/.decisiongraph. */
  dataDir?: string;
  /** Injected for tests / alternative hosts. */
  provider?: WorkspaceProvider;
  engine?: DecisionGraphEngine;
}

/** The same composition wiring the CLI uses (shared helper). */
export function defaultProvider(dataDir: string): WorkspaceProvider {
  return createLocalProvider(dataDir);
}

function resolveDataDir(explicit?: string): string {
  if (explicit) return path.resolve(explicit);
  const env = process.env.DG_DATA_DIR;
  if (env) return path.resolve(env);
  return path.resolve(process.cwd(), WORKSPACE_DIR);
}

export function buildMcpContext(o: BuildContextOptions = {}): McpContext {
  const dataDir = resolveDataDir(o.dataDir);
  return {
    provider: o.provider ?? defaultProvider(dataDir),
    engine: o.engine ?? new DecisionGraphEngine(),
    dataDir,
  };
}

/** Resolve the workspace a tool/resource call targets (by ref). */
export function resolveWorkspace(ctx: McpContext, ref: string): Promise<Workspace> {
  return ctx.provider.resolve(ref);
}
