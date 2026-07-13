/**
 * tests/engine-api.test.ts — Phase 2.6 DecisionGraphEngine public API.
 *
 * Exercises the facade methods (ingest/buildGraph/ask/replay/evaluate/export/
 * analyze), plus cancellation, resume, and composed-workflow behaviour. LLM-free
 * paths run for real; LLM-dependent methods use a scripted fake or assert
 * graceful error surfacing.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DecisionGraphEngine,
  ConnectorRegistry,
  type Workspace,
  type WorkflowEvent,
} from "@dg/core";
import { GitHubConnector } from "@dg/connectors";
import { LocalDecisionStore, LocalEvidenceStore, LocalRunStore, LocalSyncStore } from "@dg/workspace-local";
import { JsonGraphStore } from "@dg/engine/graph/GraphStore.js";
import { buildGraph } from "@dg/engine/graph/GraphBuilder.js";
import { RunLog } from "@dg/engine/agent/RunLog.js";
import { CacheStore } from "@dg/engine/evidence/CacheStore.js";
import { CachedEvidenceRepository } from "@dg/engine/evidence/EvidenceRepository.js";
import type { OctokitLike } from "@dg/engine/evidence/GitHubFetcher.js";
import type { LlmClient, LlmRequest, LlmResponse } from "@dg/engine/llm/LlmClient.js";
import type { Answer } from "@dg/engine/query/QueryEngine.js";
import type { DecisionObject } from "@dg/domain/types.js";
import type { SourceSystem } from "@dg/domain/graph.js";

/* ------------------------------ fixtures -------------------------------- */

const throwingLlm: LlmClient = {
  model: "throwing",
  async complete() {
    throw new Error("LLM unavailable in this test");
  },
};

/** Scripted answerer (mirrors query.test): records a single cited answer. */
class ScriptedAnswerer implements LlmClient {
  readonly model = "fake-query";
  private done = false;
  constructor(private readonly decisionId: string) {}
  async complete(_req: LlmRequest): Promise<LlmResponse> {
    if (this.done) return { stopReason: "end_turn", blocks: [], usage: { inputTokens: 1, outputTokens: 1 } };
    this.done = true;
    const answer: Answer = {
      answer: "Because uncontrolled state caused SSR hydration bugs, the API is controlled-only.",
      certainty: "known",
      supportingDecisionIds: [this.decisionId],
      supportingEvidenceUrls: ["https://github.com/o/r/pull/42"],
      missingEvidence: null,
      reasoningSummary: "Single decision directly answers the question with cited PR evidence.",
    };
    return { stopReason: "tool_use", blocks: [{ type: "tool_use", id: "t1", name: "record_answer", input: answer }], usage: { inputTokens: 10, outputTokens: 10 } };
  }
}

function mkDecision(): DecisionObject {
  return {
    id: "d", title: "Dropdown exposes a controlled-only selection API", scope: { component: "Dropdown" },
    status: "adopted",
    hypothesis: "Controlled-only state avoids SSR hydration mismatches entirely.",
    context: "Recurring hydration bugs with uncontrolled state broke checkout.",
    alternatives: [], chosenSolution: "Require value/onChange; drop internal selection state.",
    tradeOffs: [],
    evidence: [{ id: "pr-42", kind: "pr", url: "https://github.com/o/r/pull/42", title: "controlled API", excerpt: "SSR hydration mismatches kept breaking checkout flows", date: "2023-04-01" }],
    observedOutcome: null, confidence: "high", confidenceRationale: "explicit PR discussion",
    actors: ["alice"], decidedAt: "2023-04-01",
    extraction: { runId: "run-1", model: "m", toolCalls: 5, ts: "2026-01-01" },
  };
}

function fakeOctokit(): OctokitLike {
  return {
    async paginate(route: string): Promise<unknown[]> {
      if (route.includes("/issues")) {
        return [{ number: 1, title: "Dropdown a11y", state: "open", user: { login: "a" }, body: "native select fails", html_url: "https://github.com/o/r/issues/1", created_at: "2023-01-01T00:00:00Z", updated_at: "2023-01-01T00:00:00Z", closed_at: null, labels: [] }];
      }
      return [];
    },
    async request(route: string): Promise<{ data: unknown }> {
      return route.includes("/commits") ? { data: [] } : { data: {} };
    },
  };
}

/** A full Workspace test double: real stores + injectable llm + connectors. */
function makeWorkspace(dir: string, opts: { llm?: LlmClient; octokit?: OctokitLike } = {}): Workspace {
  const graph = new JsonGraphStore(dir, "o/r");
  const runsDir = path.join(dir, "runs");
  const runStore = new LocalRunStore(runsDir);
  const registry = new ConnectorRegistry().register(new GitHubConnector());
  const connectors = [{ source: "github" as SourceSystem, config: { octokit: opts.octokit } }];
  return {
    ref: "o/r",
    config: { repo: "o/r", model: "m", promptVersion: "v2", toolBudget: 25, connectors },
    stores() {
      const cache = () => new CacheStore(path.join(dir, "cache"), "o/r");
      return {
        evidence: () => new CachedEvidenceRepository(cache(), "o/r"),
        evidenceWrite: () => new LocalEvidenceStore(cache()),
        graph: () => graph,
        decisions: () => new LocalDecisionStore(path.join(dir, "decisions")),
        runLog: () => ({ read: (id: string) => RunLog.read(runsDir, id) }),
        sync: () => new LocalSyncStore(dir),
      };
    },
    llm: () => opts.llm ?? throwingLlm,
    dataDir: () => dir,
    runsDir: () => runsDir,
    runStore: () => runStore,
    connectors: () => connectors,
    connector: (source) => registry.get(source),
    saveCursor: () => {},
  };
}

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dg-api-"));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

function seedGraph(dir: string): string {
  const store = new JsonGraphStore(dir, "o/r");
  const { nodes, edges } = buildGraph("o/r", [mkDecision()]);
  for (const n of nodes) store.upsertNode(n);
  for (const e of edges) store.addEdge(e);
  store.flush();
  return store.nodes({ type: "decision" })[0]!.id;
}

/* -------------------------------- tests --------------------------------- */

describe("DecisionGraphEngine facade", () => {
  it("ingest() runs the connector through the workspace", async () => {
    const engine = new DecisionGraphEngine();
    const ws = makeWorkspace(tmp, { octokit: fakeOctokit() });
    const r = await engine.ingest({ workspace: ws, source: "github" });
    expect(r.status).toBe("completed");
    expect(r.output?.counts.issues).toBe(1);
    expect((await ws.stores().evidence("github").getIssue(1)).title).toBe("Dropdown a11y");
  });

  it("buildGraph() builds from persisted decisions", async () => {
    const engine = new DecisionGraphEngine();
    const ws = makeWorkspace(tmp);
    ws.stores().decisions().save("Dropdown", "v2", [mkDecision()]);
    const r = await engine.buildGraph({ workspace: ws });
    expect(r.status).toBe("completed");
    expect(r.output?.nodes).toBeGreaterThan(0);
  });

  it("ask() returns a structured answer + evidence + reasoning", async () => {
    const decisionId = seedGraph(tmp);
    const engine = new DecisionGraphEngine();
    const ws = makeWorkspace(tmp, { llm: new ScriptedAnswerer(decisionId) });
    const r = await engine.ask({ workspace: ws, question: "Why is Dropdown selection controlled only?" });
    expect(r.status).toBe("completed");
    expect(r.answer?.certainty).toBe("known");
    expect(r.evidence).toContain(decisionId);
    expect(r.reasoning?.intent).toBe("causal");
  });

  it("export() renders the graph in the requested format", async () => {
    seedGraph(tmp);
    const engine = new DecisionGraphEngine();
    const ws = makeWorkspace(tmp);
    const mermaid = await engine.export({ workspace: ws, format: "mermaid" });
    expect(mermaid.status).toBe("completed");
    expect(mermaid.output?.content).toContain("-->"); // mermaid edges rendered
    const json = await engine.export({ workspace: ws, format: "json" });
    expect(() => JSON.parse(json.output!.content)).not.toThrow();
  });

  it("replay() re-emits a recorded run's events", async () => {
    const runsDir = path.join(tmp, "runs");
    const log = new RunLog(runsDir, "seed");
    log.emit({ t: "run_started", runId: "seed", component: "Dropdown", model: "m", ts: "2026-01-01T00:00:00Z" });
    log.emit({ t: "phase", name: "planning", ts: "2026-01-01T00:00:01Z" });

    const engine = new DecisionGraphEngine();
    const ws = makeWorkspace(tmp);
    const nested: WorkflowEvent[] = [];
    const r = await engine.replay({ workspace: ws, recordedRunId: "seed", sinks: [(e) => { if (e.payload.kind === "run_event") nested.push(e); }] });
    expect(r.status).toBe("completed");
    expect(r.output?.events).toBe(2);
    expect(nested).toHaveLength(2);
  });

  it("evaluate() surfaces failures as a structured result (no throw)", async () => {
    const engine = new DecisionGraphEngine();
    const ws = makeWorkspace(tmp); // throwing llm → judge step fails
    ws.stores().decisions().save("Dropdown", "v2", [mkDecision()]);
    const r = await engine.evaluate({ workspace: ws, component: "Dropdown" });
    expect(r.status).toBe("failed");
    expect(r.error?.message).toBeTruthy();
  });

  it("cancellation: an aborted signal yields status truncated", async () => {
    const engine = new DecisionGraphEngine();
    const ws = makeWorkspace(tmp);
    ws.stores().decisions().save("Dropdown", "v2", [mkDecision()]);
    const ac = new AbortController();
    ac.abort();
    const r = await engine.buildGraph({ workspace: ws, signal: ac.signal });
    expect(r.status).toBe("truncated");
  });

  it("resume: a second run with the same runId skips completed idempotent steps", async () => {
    const engine = new DecisionGraphEngine();
    const ws = makeWorkspace(tmp);
    ws.stores().decisions().save("Dropdown", "v2", [mkDecision()]);
    const runStore = new LocalRunStore(path.join(tmp, "runs"));

    const first = await engine.buildGraph({ workspace: ws, runStore, runId: "fixed" });
    expect(first.status).toBe("completed");

    const skipped: string[] = [];
    const second = await engine.buildGraph({
      workspace: ws, runStore, resume: { mode: "resume", runId: "fixed" },
      sinks: [(e) => { if (e.payload.kind === "lifecycle" && e.payload.lifecycle.kind === "step_skipped") skipped.push(e.payload.lifecycle.step); }],
    });
    expect(second.status).toBe("completed");
    expect(skipped).toContain("graph.loadDecisions");
    expect(skipped).toContain("graph.build");
  });

  it("analyze() composes stages and halts at the first failure, reporting the stage", async () => {
    const engine = new DecisionGraphEngine();
    const ws = makeWorkspace(tmp, { octokit: fakeOctokit() }); // ingest ok, extract fails (throwing llm)
    const r = await engine.analyze({ workspace: ws, source: "github", components: ["Dropdown"] });
    expect(r.status).toBe("failed");
    expect(r.error?.stage).toBe("extract");
    expect(r.steps.ingest?.status).toBe("completed"); // earlier stage ran
    expect(r.steps.graph).toBeUndefined(); // later stages did not
  });
});
