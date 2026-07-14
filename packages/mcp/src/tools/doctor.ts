/**
 * dg_doctor — workspace / connector / graph health as structured JSON.
 *
 * Reuses the same Workspace inspection the CLI performs, but through the
 * Workspace API + SyncStore (the platform's own sync-health record) rather than
 * ad-hoc file reads. It renders NO text — it returns a structured object. It
 * calls the WorkspaceProvider (allowed) and reads through the Workspace; no
 * engine internals, no business logic.
 */

import { MCP_VERSION, resolveWorkspace } from "../context.js";
import type { ToolHandler } from "./types.js";

export interface DoctorArgs {
  /** Workspace ref; defaults to the first workspace the provider lists. */
  workspace?: string;
}

interface ConnectorHealth {
  source: string;
  tokenEnv: string;
  tokenPresent: boolean;
  lastSync: string | null;
  lastStatus: string | null;
  counts: Record<string, number> | null;
}

export const dgDoctor: ToolHandler<DoctorArgs> = async ({ ctx, args }) => {
  const ref = args.workspace ?? (await ctx.provider.list())[0];

  const health: {
    tool: "dg_doctor";
    engineVersion: string;
    dataDir: string;
    workspace: { ok: boolean; repo: string | null; model?: string; promptVersion?: string };
    connectors: ConnectorHealth[];
    graph: { nodes: number };
  } = {
    tool: "dg_doctor",
    engineVersion: MCP_VERSION,
    dataDir: ctx.dataDir,
    workspace: { ok: false, repo: ref ?? null },
    connectors: [],
    graph: { nodes: 0 },
  };

  if (ref) {
    const ws = await resolveWorkspace(ctx, ref);
    const sync = ws.stores().sync();
    health.workspace = { ok: true, repo: ws.config.repo, model: ws.config.model, promptVersion: ws.config.promptVersion };
    health.connectors = ws.connectors().map((b) => {
      const tokenEnv = (b.config.tokenEnv as string | undefined) ?? "GITHUB_TOKEN";
      const latest = sync.latest(b.source);
      return {
        source: b.source,
        tokenEnv,
        tokenPresent: Boolean((b.config.token as string | undefined) ?? process.env[tokenEnv]),
        lastSync: latest?.completedAt ?? null,
        lastStatus: latest?.status ?? null,
        counts: latest?.counts ?? null,
      };
    });
    health.graph = { nodes: ws.stores().graph().nodes().length };
  }

  return { isError: false, structured: health };
};
