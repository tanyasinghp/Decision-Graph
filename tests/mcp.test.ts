/**
 * tests/mcp.test.ts — Phase 3.2 MCP tools (dg_doctor, dg_ingest, dg_analyze, dg_ask).
 *
 * Everything is faked — no GitHub, no Anthropic, no Ollama. We mock the
 * DecisionGraphEngine, WorkspaceProvider and Workspace, and a ProgressEmitter,
 * then assert: correct engine method invoked, workspace resolved, progress sink
 * attached, structured result returned, error mapping, cancellation propagation.
 */

import { describe, expect, it } from "vitest";
import { dgDoctor, dgIngest, dgAnalyze, dgAsk, toolHandlers, toolDefinitions } from "@dg/mcp";
import type { McpContext } from "@dg/mcp";
import type {
  DecisionGraphEngine,
  EventSink,
  SyncMetadata,
  Workspace,
  WorkspaceProvider,
} from "@dg/core";
import type { ProgressEmitter } from "@dg/mcp";

/* ------------------------------ test doubles ---------------------------- */

function captureEmitter(): { emitter: ProgressEmitter; progress: unknown[]; logs: unknown[] } {
  const progress: unknown[] = [];
  const logs: unknown[] = [];
  return {
    emitter: { progress: (u) => progress.push(u), log: (e) => logs.push(e) },
    progress,
    logs,
  };
}

function fakeWorkspace(over: Partial<Record<string, unknown>> = {}): Workspace {
  const sync: SyncMetadata = {
    schemaVersion: 1, source: "github", repo: "o/r", status: "completed",
    startedAt: "t0", completedAt: "t1", durationMs: 10, artifacts: 8,
    counts: { issues: 2, prs: 1, commits: 5 }, cursor: { since: "t1" },
  };
  return {
    ref: "o/r",
    config: { repo: "o/r", model: "m", promptVersion: "v2", toolBudget: 25, connectors: [{ source: "github", config: { tokenEnv: "GH_TOK" } }] },
    connectors: () => [{ source: "github", config: { tokenEnv: "GH_TOK" } }],
    stores: () => ({
      sync: () => ({ write() {}, latest: () => sync, list: () => [sync] }),
      graph: () => ({ nodes: () => [{ id: "n1" }, { id: "n2" }] }),
    }),
    ...over,
  } as unknown as Workspace;
}

/**
 * Records which method was called and with what options. `results` overrides a
 * method's return value — either a plain result object, or a function of the
 * received options (to inspect sinks/signal and shape the result).
 */
function fakeEngine(results: Record<string, unknown> = {}): { engine: DecisionGraphEngine; calls: Record<string, unknown> } {
  const calls: Record<string, unknown> = {};
  const defaults: Record<string, unknown> = {
    ingest: { status: "completed", runId: "r1", events: 3, output: { source: "github", counts: { issues: 2 }, artifacts: 8, cursor: {}, complete: true } },
    extract: { status: "completed", runId: "r2", events: 2, output: { components: [] } },
    buildGraph: { status: "completed", runId: "r3", events: 2, output: { nodes: 0, edges: 0, assertedEdges: 0 } },
    link: { status: "completed", runId: "r4", events: 2, output: {} },
    analyze: { status: "completed", events: 12, summary: { repo: "o/r", nodes: 10, edges: 20, decisions: 2 }, steps: {} },
    evaluate: { status: "completed", runId: "r5", events: 2, output: { component: "x", metrics: {}, verdict: {} } },
    ask: { status: "completed", runId: "ask-1", events: 2, answer: { answer: "because", certainty: "known", supportingDecisionIds: ["d1"], supportingEvidenceUrls: [], reasoningSummary: "r", missingEvidence: null }, reasoning: { intent: "causal" }, evidence: ["d1"] },
    counterfactual: { status: "completed", runId: "cf-1", events: 2, answer: { answer: "maybe", certainty: "speculative", supportingDecisionIds: ["d1"], supportingEvidenceUrls: [], reasoningSummary: "r", missingEvidence: null } },
    export: { status: "completed", runId: "r6", events: 1, output: { format: "json", content: "{}" } },
    replay: { status: "completed", runId: "r7", events: 3, output: { events: 10 } },
  };
  const method = (name: string) => async (o: Record<string, unknown>) => {
    calls[name] = o;
    const r = results[name] ?? defaults[name];
    return typeof r === "function" ? (r as (a: unknown) => unknown)(o) : r;
  };
  const engine = { ingest: method("ingest"), extract: method("extract"), buildGraph: method("buildGraph"), link: method("link"), analyze: method("analyze"), evaluate: method("evaluate"), ask: method("ask"), counterfactual: method("counterfactual"), export: method("export"), replay: method("replay") };
  return { engine: engine as unknown as DecisionGraphEngine, calls };
}

function fakeProvider(ws: Workspace, resolved: string[] = []): { provider: WorkspaceProvider; resolved: string[] } {
  const provider: WorkspaceProvider = {
    resolve: async (ref: string) => { resolved.push(ref); return ws; },
    create: async () => ws,
    list: async () => ["o/r"],
  };
  return { provider, resolved };
}

function makeCtx(engine: DecisionGraphEngine, provider: WorkspaceProvider): McpContext {
  return { engine, provider, dataDir: "/tmp/.decisiongraph" };
}

const sink = (): { emitter: ProgressEmitter } => captureEmitter();

/* -------------------------------- registry ------------------------------ */

describe("tool registry", () => {
  it("exposes all eleven MCP tools", () => {
    expect(Object.keys(toolHandlers).sort()).toEqual([
      "dg_analyze", "dg_ask", "dg_counterfactual", "dg_doctor", "dg_evaluate",
      "dg_export", "dg_extract", "dg_graph", "dg_ingest", "dg_link", "dg_replay",
    ]);
    expect(toolDefinitions.map((d) => d.name).sort()).toEqual([
      "dg_analyze", "dg_ask", "dg_counterfactual", "dg_doctor", "dg_evaluate",
      "dg_export", "dg_extract", "dg_graph", "dg_ingest", "dg_link", "dg_replay",
    ]);
  });
});

/* -------------------------------- dg_ingest ----------------------------- */

describe("dg_ingest", () => {
  it("resolves the workspace, attaches a progress sink, calls engine.ingest, returns structured result", async () => {
    const { engine, calls } = fakeEngine();
    const resolved: string[] = [];
    const { provider } = fakeProvider(fakeWorkspace(), resolved);
    const em = captureEmitter();

    const res = await dgIngest({ ctx: makeCtx(engine, provider), args: { workspace: "o/r", source: "github" }, signal: new AbortController().signal, emitter: em.emitter });

    expect(resolved).toEqual(["o/r"]);                          // workspace resolved
    const o = calls.ingest as { workspace: unknown; source: string; sinks: EventSink[]; signal: AbortSignal };
    expect(o.source).toBe("github");                            // correct method + args
    expect(o.sinks).toHaveLength(1);                            // progress sink attached
    expect(res.isError).toBe(false);
    expect((res as { structured: { status: string } }).structured.status).toBe("completed");
  });

  it("forwards WorkflowEvents to the emitter through the attached sink", async () => {
    const { engine } = fakeEngine({
      ingest: (o: { sinks: EventSink[] }) => {
        o.sinks[0]!({ runId: "r", workflow: "ingest", seq: 0, ts: "t", level: "progress", payload: { kind: "connector", progress: { source: "github", message: "issues", current: 2, total: 2 } } });
        return { status: "completed", events: 1, output: { source: "github", counts: {}, artifacts: 0, cursor: {}, complete: true } };
      },
    });
    const { provider } = fakeProvider(fakeWorkspace());
    const em = captureEmitter();
    await dgIngest({ ctx: makeCtx(engine, provider), args: { workspace: "o/r" }, signal: new AbortController().signal, emitter: em.emitter });
    expect(em.progress).toHaveLength(1);
    expect(em.progress[0]).toMatchObject({ total: 2, message: "issues" });
  });

  it("maps a failed status to a tool error exactly once", async () => {
    const { engine } = fakeEngine({ ingest: { status: "failed", error: { message: "no token" }, events: 1 } });
    const { provider } = fakeProvider(fakeWorkspace());
    const res = await dgIngest({ ctx: makeCtx(engine, provider), args: { workspace: "o/r" }, signal: new AbortController().signal, emitter: sink().emitter });
    expect(res).toMatchObject({ isError: true, status: "failed", message: "no token", resumable: false });
  });

  it("propagates cancellation (truncated → resumable tool error)", async () => {
    const ac = new AbortController();
    ac.abort();
    const { engine, calls } = fakeEngine({
      ingest: (o: { signal: AbortSignal }) => ({ status: o.signal.aborted ? "truncated" : "completed", runId: "r9", events: 1 }),
    });
    const { provider } = fakeProvider(fakeWorkspace());
    const res = await dgIngest({ ctx: makeCtx(engine, provider), args: { workspace: "o/r" }, signal: ac.signal, emitter: sink().emitter });
    expect((calls.ingest as { signal: AbortSignal }).signal.aborted).toBe(true); // signal propagated
    expect(res).toMatchObject({ isError: true, status: "truncated", resumable: true, runId: "r9" });
  });
});

/* -------------------------------- dg_analyze ---------------------------- */

describe("dg_analyze", () => {
  it("calls engine.analyze and returns AnalyzeResult unchanged", async () => {
    const { engine, calls } = fakeEngine();
    const { provider } = fakeProvider(fakeWorkspace());
    const res = await dgAnalyze({ ctx: makeCtx(engine, provider), args: { workspace: "o/r", components: ["Dropdown"] }, signal: new AbortController().signal, emitter: sink().emitter });
    const o = calls.analyze as { components: string[]; sinks: EventSink[] };
    expect(o.components).toEqual(["Dropdown"]);
    expect(o.sinks).toHaveLength(1);
    expect((res as { structured: { summary: unknown } }).structured).toMatchObject({ summary: { decisions: 2 } });
  });

  it("maps a failed analyze to a tool error", async () => {
    const { engine } = fakeEngine({ analyze: { status: "failed", error: { message: "extract failed" }, events: 4, steps: {} } });
    const { provider } = fakeProvider(fakeWorkspace());
    const res = await dgAnalyze({ ctx: makeCtx(engine, provider), args: { workspace: "o/r", components: ["Dropdown"] }, signal: new AbortController().signal, emitter: sink().emitter });
    expect(res).toMatchObject({ isError: true, status: "failed", message: "extract failed" });
  });
});

/* --------------------------------- dg_ask ------------------------------- */

describe("dg_ask", () => {
  it("calls engine.ask and returns AskResult unchanged", async () => {
    const { engine, calls } = fakeEngine();
    const { provider } = fakeProvider(fakeWorkspace());
    const res = await dgAsk({ ctx: makeCtx(engine, provider), args: { workspace: "o/r", question: "why?" }, signal: new AbortController().signal, emitter: sink().emitter });
    expect((calls.ask as { question: string }).question).toBe("why?");
    expect((calls.ask as { sinks: EventSink[] }).sinks).toHaveLength(1);
    expect((res as { structured: { answer: { certainty: string } } }).structured.answer.certainty).toBe("known");
  });
});

/* -------------------------------- dg_doctor ----------------------------- */

describe("dg_doctor", () => {
  it("returns structured health via the Workspace + SyncStore (no engine call, no text)", async () => {
    const { engine } = fakeEngine();
    const resolved: string[] = [];
    const { provider } = fakeProvider(fakeWorkspace(), resolved);
    const res = await dgDoctor({ ctx: makeCtx(engine, provider), args: { workspace: "o/r" }, signal: new AbortController().signal, emitter: sink().emitter });

    expect(res.isError).toBe(false);
    const h = (res as { structured: Record<string, unknown> }).structured as {
      tool: string; workspace: { ok: boolean; repo: string }; graph: { nodes: number };
      connectors: Array<{ source: string; tokenPresent: boolean; lastStatus: string; counts: unknown }>;
    };
    expect(resolved).toEqual(["o/r"]);
    expect(h.tool).toBe("dg_doctor");
    expect(h.workspace).toMatchObject({ ok: true, repo: "o/r" });
    expect(h.graph.nodes).toBe(2);
    expect(h.connectors[0]).toMatchObject({ source: "github", lastStatus: "completed" });
    expect(h.connectors[0]!.counts).toMatchObject({ issues: 2, commits: 5 });
  });

  it("reports workspace not-ok when the provider lists none", async () => {
    const { engine } = fakeEngine();
    const provider: WorkspaceProvider = { resolve: async () => fakeWorkspace(), create: async () => fakeWorkspace(), list: async () => [] };
    const res = await dgDoctor({ ctx: makeCtx(engine, provider), args: {}, signal: new AbortController().signal, emitter: sink().emitter });
    expect((res as { structured: { workspace: { ok: boolean } } }).structured.workspace.ok).toBe(false);
  });
});
