/**
 * tests/mcp-resources.test.ts — Phase 3.3 MCP resources (read-only).
 *
 * Fully faked Workspace + WorkspaceProvider — no GitHub, Anthropic, or Ollama.
 * Verifies: resources resolve correctly, structured output, empty workspace,
 * empty graph, missing sync metadata.
 */

import { describe, expect, it } from "vitest";
import {
  resWorkspaceCurrent,
  resSync,
  resGraph,
  resDecisions,
  resRuns,
  resourceHandlers,
  resourceDefinitions,
  URI_WORKSPACE,
  URI_SYNC,
  URI_GRAPH,
  URI_DECISIONS,
  URI_RUNS,
} from "@dg/mcp";
import type { McpContext } from "@dg/mcp";
import type { Checkpoint, SyncMetadata, Workspace, WorkspaceProvider } from "@dg/core";

/* ------------------------------ test doubles ---------------------------- */

interface FakeData {
  nodes?: Array<{ type: string }>;
  edges?: Array<{ type: string }>;
  decisions?: Array<{ id: string; title: string; confidence: string; decidedAt?: string; extraction?: { ts: string } }>;
  syncs?: SyncMetadata[];
  runs?: Checkpoint[];
}

function fakeWorkspace(data: FakeData = {}): Workspace {
  return {
    ref: "o/r",
    config: { repo: "o/r", model: "m", promptVersion: "v2", toolBudget: 25 },
    dataDir: () => "/tmp/.decisiongraph",
    connectors: () => [{ source: "github", config: { tokenEnv: "GH_TOK" } }],
    stores: () => ({
      graph: () => ({ nodes: () => data.nodes ?? [], edges: () => data.edges ?? [] }),
      decisions: () => ({ loadAll: () => data.decisions ?? [], loadComponent: () => [], save() {} }),
      sync: () => ({ write() {}, latest: () => undefined, list: () => data.syncs ?? [] }),
    }),
    runStore: () => ({ list: () => data.runs ?? [] }),
  } as unknown as Workspace;
}

function provider(ws?: Workspace): WorkspaceProvider {
  return {
    resolve: async () => ws ?? fakeWorkspace(),
    create: async () => ws ?? fakeWorkspace(),
    list: async () => (ws ? ["o/r"] : []),
  };
}

function ctx(ws?: Workspace): McpContext {
  return { engine: {} as never, provider: provider(ws), dataDir: "/tmp/.decisiongraph" };
}

const sync = (over: Partial<SyncMetadata> = {}): SyncMetadata => ({
  schemaVersion: 1, source: "github", repo: "o/r", status: "completed",
  startedAt: "t0", completedAt: "2026-01-02T00:00:00Z", durationMs: 10, artifacts: 8,
  counts: { issues: 2, commits: 5 }, ...over,
});

const ckpt = (over: Partial<Checkpoint>): Checkpoint => ({
  runId: "r", workflow: "ingest", inputHash: "h", completedSteps: {}, lastSeq: 1,
  status: "completed", updatedAt: "2026-01-01T00:00:00Z", ...over,
});

/* -------------------------------- registry ------------------------------ */

describe("resource registry", () => {
  it("exposes exactly the five Phase 3.3 resources", () => {
    const uris = [URI_WORKSPACE, URI_SYNC, URI_GRAPH, URI_DECISIONS, URI_RUNS];
    expect(Object.keys(resourceHandlers).sort()).toEqual([...uris].sort());
    expect(resourceDefinitions.map((d) => d.uri).sort()).toEqual([...uris].sort());
  });
});

/* --------------------------- workspace/current -------------------------- */

describe("decisiongraph://workspace/current", () => {
  it("returns repo, path, connectors (no secrets), engine version", async () => {
    const r = await resWorkspaceCurrent({ ctx: ctx(fakeWorkspace()) });
    expect(r.uri).toBe(URI_WORKSPACE);
    const c = r.contents as { repository: string; workspacePath: string; connectors: Array<{ source: string; hasInlineToken: boolean }>; engineVersion: string };
    expect(c.repository).toBe("o/r");
    expect(c.workspacePath).toBe("/tmp/.decisiongraph");
    expect(c.connectors[0]).toMatchObject({ source: "github", tokenEnv: "GH_TOK", hasInlineToken: false });
    expect(c.engineVersion).toBeTruthy();
  });

  it("empty workspace → repository null, connectors empty", async () => {
    const r = await resWorkspaceCurrent({ ctx: ctx() }); // provider.list() → []
    expect((r.contents as { repository: string | null }).repository).toBeNull();
    expect((r.contents as { connectors: unknown[] }).connectors).toEqual([]);
  });
});

/* --------------------------------- sync --------------------------------- */

describe("decisiongraph://sync", () => {
  it("exposes every connector's sync metadata", async () => {
    const r = await resSync({ ctx: ctx(fakeWorkspace({ syncs: [sync(), sync({ source: "slack" })] })) });
    const c = r.contents as { count: number; connectors: SyncMetadata[] };
    expect(c.count).toBe(2);
    expect(c.connectors.map((s) => s.source)).toEqual(["github", "slack"]);
  });

  it("missing sync metadata → empty list", async () => {
    const r = await resSync({ ctx: ctx(fakeWorkspace({ syncs: [] })) });
    expect(r.contents).toEqual({ count: 0, connectors: [] });
  });
});

/* --------------------------------- graph -------------------------------- */

describe("decisiongraph://graph", () => {
  it("returns node/edge counts + type breakdown (metadata only)", async () => {
    const ws = fakeWorkspace({
      nodes: [{ type: "decision" }, { type: "decision" }, { type: "issue" }],
      edges: [{ type: "SUPPORTED_BY" }, { type: "AFFECTS" }],
    });
    const r = await resGraph({ ctx: ctx(ws) });
    expect(r.contents).toEqual({
      nodeCount: 3,
      edgeCount: 2,
      nodesByType: { decision: 2, issue: 1 },
      edgesByType: { SUPPORTED_BY: 1, AFFECTS: 1 },
    });
  });

  it("empty graph → zero counts", async () => {
    const r = await resGraph({ ctx: ctx(fakeWorkspace()) });
    expect(r.contents).toMatchObject({ nodeCount: 0, edgeCount: 0, nodesByType: {}, edgesByType: {} });
  });
});

/* ------------------------------- decisions ------------------------------ */

describe("decisiongraph://decisions", () => {
  it("returns count, latest (sorted), and confidence distribution", async () => {
    const ws = fakeWorkspace({
      decisions: [
        { id: "d1", title: "older", confidence: "high", decidedAt: "2023-01-01" },
        { id: "d2", title: "newer", confidence: "medium", decidedAt: "2023-06-01" },
        { id: "d3", title: "mid", confidence: "high", decidedAt: "2023-03-01" },
      ],
    });
    const r = await resDecisions({ ctx: ctx(ws) });
    const c = r.contents as { count: number; latest: Array<{ id: string }>; confidence: Record<string, number> };
    expect(c.count).toBe(3);
    expect(c.confidence).toEqual({ high: 2, medium: 1, low: 0 });
    expect(c.latest[0]!.id).toBe("d2"); // most recent first
  });

  it("empty workspace → zero decisions", async () => {
    const r = await resDecisions({ ctx: ctx() });
    expect(r.contents).toEqual({ count: 0, latest: [], confidence: { high: 0, medium: 0, low: 0 } });
  });
});

/* --------------------------------- runs --------------------------------- */

describe("decisiongraph://runs", () => {
  it("returns recent runs (id, workflow, status, timestamp) newest first", async () => {
    const ws = fakeWorkspace({
      runs: [
        ckpt({ runId: "a", updatedAt: "2026-01-01T00:00:00Z", status: "completed" }),
        ckpt({ runId: "b", updatedAt: "2026-03-01T00:00:00Z", status: "failed", workflow: "extract" }),
      ],
    });
    const r = await resRuns({ ctx: ctx(ws) });
    const c = r.contents as { count: number; runs: Array<{ runId: string; status: string; workflow: string }> };
    expect(c.count).toBe(2);
    expect(c.runs[0]).toMatchObject({ runId: "b", status: "failed", workflow: "extract" }); // newest first
  });

  it("no runs → empty list", async () => {
    const r = await resRuns({ ctx: ctx(fakeWorkspace({ runs: [] })) });
    expect(r.contents).toEqual({ count: 0, runs: [] });
  });
});
