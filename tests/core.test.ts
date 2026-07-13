/**
 * tests/core.test.ts — Phase 2.3 core.
 *
 * Covers the generic WorkflowEngine (events, checkpoint, resume-skip,
 * cancellation, typed output) with lightweight fake steps, and two real
 * service-wrapping workflows: graph.build (buildGraph + JsonGraphStore, no
 * model) and replay (RunLog, no model).
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DecisionGraphEngine,
  WorkflowEngine,
  InMemoryRunStore,
  graphBuildWorkflow,
  replayWorkflow,
  type Workflow,
  type Step,
  type Workspace,
  type WorkflowEvent,
} from "@dg/core";

import { JsonGraphStore } from "@dg/engine/graph/GraphStore.js";
import { RunLog } from "@dg/engine/agent/RunLog.js";
import type { DecisionObject } from "@dg/domain/types.js";
import type { LlmClient } from "@dg/engine/llm/LlmClient.js";

/* ---------------------------------------------------------------- */
/* Test doubles                                                      */
/* ---------------------------------------------------------------- */

const throwingLlm: LlmClient = {
  model: "test-model",
  async complete() {
    throw new Error("LLM must not be called in these tests");
  },
};

function mkDecision(over: Partial<DecisionObject> = {}): DecisionObject {
  return {
    id: "dec-dropdown-1",
    title: "Dropdown exposes a controlled-only selection API",
    scope: { component: "Dropdown" },
    status: "adopted",
    hypothesis: "Controlled-only state avoids SSR hydration mismatches entirely.",
    context: "Recurring hydration bugs with uncontrolled state broke checkout.",
    alternatives: [{ option: "dual mode", reasonRejected: "doubles surface", evidenceIds: ["issue-7"] }],
    chosenSolution: "Require value/onChange; drop internal selection state.",
    tradeOffs: ["boilerplate for simple cases"],
    evidence: [
      { id: "pr-42", kind: "pr", url: "https://github.com/o/r/pull/42", title: "controlled API", excerpt: "SSR hydration mismatches kept breaking checkout flows", date: "2023-04-01" },
      { id: "issue-7", kind: "issue", url: "https://github.com/o/r/issues/7", title: "dual mode proposal", excerpt: "we could support both controlled and uncontrolled modes", date: "2023-03-20" },
    ],
    observedOutcome: null,
    confidence: "high",
    confidenceRationale: "explicit PR discussion",
    actors: ["alice", "bob"],
    decidedAt: "2023-04-01",
    extraction: { runId: "run-1", model: "m", toolCalls: 10, ts: "2026-01-01" },
    ...over,
  };
}

/** Minimal Workspace backed by a temp dir; only what these workflows touch. */
function makeWorkspace(dir: string, decisions: DecisionObject[]): Workspace {
  const graph = new JsonGraphStore(dir, "o/r");
  const runStore = new InMemoryRunStore();
  const runsDir = path.join(dir, "runs");
  return {
    ref: "o/r",
    config: { repo: "o/r", model: "test-model", promptVersion: "v2", toolBudget: 25 },
    stores() {
      return {
        evidence() {
          throw new Error("evidence not needed");
        },
        evidenceWrite() {
          throw new Error("evidenceWrite not needed");
        },
        graph() {
          return graph;
        },
        decisions() {
          return {
            save() {},
            loadComponent: () => decisions,
            loadAll: () => decisions,
          };
        },
        runLog() {
          return { read: (id: string) => RunLog.read(runsDir, id) };
        },
        sync() {
          throw new Error("sync not needed");
        },
      };
    },
    llm() {
      return throwingLlm;
    },
    dataDir() {
      return dir;
    },
    runsDir() {
      return runsDir;
    },
    runStore() {
      return runStore;
    },
    connectors() {
      return [];
    },
    connector() {
      throw new Error("no connectors in this test");
    },
    saveCursor() {},
  };
}

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dg-core-"));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

/* ---------------------------------------------------------------- */
/* Generic engine mechanics (fake steps)                            */
/* ---------------------------------------------------------------- */

describe("WorkflowEngine mechanics", () => {
  const stepA: Step<number, number> = {
    id: "a",
    title: "A",
    idempotent: true,
    async run(n) {
      return n + 1;
    },
  };
  const stepB: Step<number, number> = {
    id: "b",
    title: "B",
    idempotent: true,
    async run(n) {
      return n * 10;
    },
  };
  const wf: Workflow<{ start: number }, { value: number }> = {
    name: "math",
    steps: [stepA, stepB],
    async execute(input, ctx) {
      const a = await ctx.runStep(stepA, input.start);
      const b = await ctx.runStep(stepB, a);
      return { value: b };
    },
  };

  it("produces a typed output and completes", async () => {
    const engine = new WorkflowEngine();
    const ws = makeWorkspace(tmp, []);
    const { result } = engine.run(wf, { start: 2 }, { workspace: ws });
    const r = await result;
    expect(r.status).toBe("completed");
    expect(r.output).toEqual({ value: 30 }); // (2+1)*10
  });

  it("emits an ordered lifecycle stream", async () => {
    const engine = new WorkflowEngine();
    const events: WorkflowEvent[] = [];
    const { result } = engine.run(wf, { start: 1 }, { workspace: makeWorkspace(tmp, []), sinks: [(e) => events.push(e)] });
    await result;
    // seq is strictly increasing
    expect(events.map((e) => e.seq)).toEqual([...events.map((_, i) => i)]);
    const kinds = events
      .filter((e) => e.payload.kind === "lifecycle")
      .map((e) => (e.payload.kind === "lifecycle" ? e.payload.lifecycle.kind : ""));
    expect(kinds).toEqual([
      "run_started",
      "step_started",
      "step_finished",
      "step_started",
      "step_finished",
      "run_finished",
    ]);
  });

  it("records a checkpoint and skips completed idempotent steps on resume", async () => {
    const engine = new WorkflowEngine();
    const store = new InMemoryRunStore();
    let runs = 0;
    const counting: Step<number, number> = {
      id: "count",
      title: "Count",
      idempotent: true,
      async run(n) {
        runs++;
        return n + 100;
      },
    };
    const w: Workflow<{ n: number }, { out: number }> = {
      name: "count-wf",
      steps: [counting],
      async execute(input, ctx) {
        return { out: await ctx.runStep(counting, input.n) };
      },
    };

    const first = engine.run(w, { n: 1 }, { workspace: makeWorkspace(tmp, []), runStore: store, runId: "fixed" });
    const r1 = await first.result;
    expect(r1.output).toEqual({ out: 101 });
    expect(runs).toBe(1);
    expect(store.getCheckpoint("fixed")?.status).toBe("completed");

    // Resume the same run id + input → step is skipped, not re-run.
    const second = engine.run(w, { n: 1 }, { workspace: makeWorkspace(tmp, []), runStore: store, resume: { mode: "resume", runId: "fixed" } });
    const r2 = await second.result;
    expect(r2.output).toEqual({ out: 101 });
    expect(runs).toBe(1); // NOT incremented — skipped from checkpoint
  });

  it("cancels at a step boundary and reports truncated (resumable)", async () => {
    const engine = new WorkflowEngine();
    const ac = new AbortController();
    const s1: Step<void, void> = {
      id: "s1",
      title: "S1",
      idempotent: false,
      async run() {
        ac.abort(); // request cancellation after the first step
      },
    };
    let ranSecond = false;
    const s2: Step<void, void> = {
      id: "s2",
      title: "S2",
      idempotent: false,
      async run() {
        ranSecond = true;
      },
    };
    const w: Workflow<void, void> = {
      name: "cancel-wf",
      steps: [s1, s2],
      async execute(_i, ctx) {
        await ctx.runStep(s1, undefined);
        await ctx.runStep(s2, undefined);
      },
    };
    const { result } = engine.run(w, undefined, { workspace: makeWorkspace(tmp, []), signal: ac.signal });
    const r = await result;
    expect(r.status).toBe("truncated");
    expect(ranSecond).toBe(false);
  });

  it("captures a failing step as status=failed without throwing", async () => {
    const engine = new WorkflowEngine();
    const boom: Step<void, void> = {
      id: "boom",
      title: "Boom",
      idempotent: false,
      async run() {
        throw new Error("kaboom");
      },
    };
    const w: Workflow<void, void> = {
      name: "fail-wf",
      steps: [boom],
      async execute(_i, ctx) {
        await ctx.runStep(boom, undefined);
      },
    };
    const r = await engine.run(w, undefined, { workspace: makeWorkspace(tmp, []) }).result;
    expect(r.status).toBe("failed");
    expect(r.error?.message).toBe("kaboom");
  });
});

/* ---------------------------------------------------------------- */
/* Real service-wrapping workflows (no model)                       */
/* ---------------------------------------------------------------- */

describe("graph.build workflow (wraps buildGraph + JsonGraphStore)", () => {
  it("builds a graph from decisions via the DecisionGraphEngine facade", async () => {
    const engine = new DecisionGraphEngine();
    const ws = makeWorkspace(tmp, [mkDecision()]);
    const { result } = engine.run(graphBuildWorkflow, { link: false }, { workspace: ws });
    const r = await result;
    expect(r.status).toBe("completed");
    expect(r.output?.nodes).toBeGreaterThan(0);
    expect(r.output?.edges).toBeGreaterThan(0);
    // persisted to disk by JsonGraphStore.flush()
    expect(fs.existsSync(path.join(tmp, "graph.json"))).toBe(true);
  });

  it("is resolvable by name from the catalog", () => {
    const engine = new DecisionGraphEngine();
    expect(engine.workflows.list()).toContain("graph.build");
    expect(engine.workflows.list()).toEqual(
      expect.arrayContaining(["extract", "graph.build", "link", "query", "evaluate", "replay"])
    );
  });
});

describe("replay workflow (wraps RunLog)", () => {
  it("re-emits recorded RunEvents as nested workflow events", async () => {
    // Seed a run log with a couple events.
    const runsDir = path.join(tmp, "runs");
    const log = new RunLog(runsDir, "seed-run");
    log.emit({ t: "run_started", runId: "seed-run", component: "Dropdown", model: "m", ts: "2026-01-01T00:00:00Z" });
    log.emit({ t: "phase", name: "planning", ts: "2026-01-01T00:00:01Z" });
    log.emit({ t: "run_finished", status: "completed", stats: {}, ts: "2026-01-01T00:00:02Z" });

    const engine = new DecisionGraphEngine();
    const nested: WorkflowEvent[] = [];
    const { result } = engine.run(
      replayWorkflow,
      { runId: "seed-run" },
      { workspace: makeWorkspace(tmp, []), sinks: [(e) => { if (e.payload.kind === "run_event") nested.push(e); }] }
    );
    const r = await result;
    expect(r.status).toBe("completed");
    expect(r.output?.events).toBe(3);
    expect(nested).toHaveLength(3);
  });
});
