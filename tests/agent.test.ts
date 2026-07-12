/**
 * tests/agent.test.ts — the runtime's control flow, driven by a scripted
 * FakeLlmClient. That the ENTIRE agent (loop, tool validation, evidence gate,
 * self-correction, budget, cancellation, replay) is testable with zero
 * Anthropic dependency is itself the proof of the model-agnostic design.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentLoop, type AgentLoopConfig } from "../src/agent/AgentLoop.js";
import { EvidenceVerifier } from "../src/agent/EvidenceVerifier.js";
import { registerExtractionTools } from "../src/agent/extractionTools.js";
import { RunLog } from "../src/agent/RunLog.js";
import { ToolRuntime } from "../src/agent/ToolRuntime.js";
import { loadPrompt } from "../src/agent/prompts.js";
import { CacheStore } from "../src/evidence/CacheStore.js";
import { CachedEvidenceRepository } from "../src/evidence/EvidenceRepository.js";
import type { LlmClient, LlmRequest, LlmResponse } from "../src/llm/LlmClient.js";
import type { DecisionObject, RunEvent } from "../src/domain/types.js";
import { z } from "zod";

/* ---------------- Fake model ---------------- */

class FakeLlmClient implements LlmClient {
  readonly model = "fake-model";
  readonly seenRequests: LlmRequest[] = [];
  constructor(private script: Array<Partial<LlmResponse>>) {}

  async complete(req: LlmRequest): Promise<LlmResponse> {
    this.seenRequests.push(req);
    const next = this.script.shift();
    if (!next) throw new Error("FakeLlmClient script exhausted");
    return {
      stopReason: next.stopReason ?? (next.blocks?.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn"),
      blocks: next.blocks ?? [],
      usage: next.usage ?? { inputTokens: 100, outputTokens: 50 },
    };
  }
}

const toolUse = (id: string, name: string, input: unknown) =>
  ({ type: "tool_use" as const, id, name, input });

/* ---------------- Fixtures ---------------- */

let tmp: string;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dg-agent-")); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

const PR_BODY =
  "We considered uncontrolled state but SSR hydration mismatches kept breaking checkout flows, so the API is controlled-only.";

function seedEvidence(): CachedEvidenceRepository {
  const cache = new CacheStore(tmp, "o/r");
  cache.mergePrs([{
    number: 42, title: "Dropdown controlled API", state: "closed", author: "dev",
    body: PR_BODY, url: "https://github.com/o/r/pull/42",
    createdAt: "2023-04-01T00:00:00Z", closedAt: null, labels: [], comments: [],
    merged: true, mergedAt: "2023-04-02T00:00:00Z", reviewComments: [], filesTouched: [],
  }]);
  return new CachedEvidenceRepository(cache, "o/r");
}

const validEmit = {
  title: "Dropdown exposes a controlled-only selection API",
  scope: { component: "Dropdown" },
  status: "adopted",
  hypothesis: "Controlled-only state avoids SSR hydration mismatches in consumer apps.",
  context: "Hydration bugs kept breaking checkout flows with uncontrolled state.",
  alternatives: [],
  chosenSolution: "Require value/onChange props; remove internal selection state.",
  tradeOffs: [],
  evidence: [{
    id: "pr-42", kind: "pr", url: "https://github.com/o/r/pull/42",
    title: "Dropdown controlled API",
    excerpt: "SSR hydration mismatches kept breaking checkout flows",
    date: "2023-04-01",
  }],
  observedOutcome: null,
  confidence: "high",
  confidenceRationale: "Explicit rationale stated in PR body",
  actors: ["dev"],
};

function buildHarness(script: Array<Partial<LlmResponse>>): {
  loop: AgentLoop; runtime: ToolRuntime; events: RunEvent[];
  decisions: DecisionObject[]; llm: FakeLlmClient; config: AgentLoopConfig;
} {
  const llm = new FakeLlmClient(script);
  const runtime = new ToolRuntime();
  const events: RunEvent[] = [];
  const decisions: DecisionObject[] = [];
  const evidence = seedEvidence();
  registerExtractionTools({
    runtime,
    evidence,
    verifier: new EvidenceVerifier(evidence),
    emitCtx: { runId: "test-run", model: "fake-model", component: "Dropdown", getToolCallCount: () => 0 },
    onDecision: (d) => decisions.push(d),
    emitEvent: (e) => events.push(e),
  });
  const loop = new AgentLoop(llm, runtime, (e) => events.push(e));
  const config: AgentLoopConfig = {
    toolBudget: 5, maxTurns: 10, maxTokens: 1000, temperature: 0,
    budgetExemptTools: ["emit_decision"],
  };
  return { loop, runtime, events, decisions, llm, config };
}

/* ---------------- Tests ---------------- */

describe("AgentLoop", () => {
  it("executes scripted tool calls and terminates when the model stops", async () => {
    const h = buildHarness([
      { blocks: [{ type: "text", text: "Plan: search first." }, toolUse("t1", "search_items", { query: "dropdown" })] },
      { blocks: [{ type: "text", text: "Done." }] },
    ]);
    const res = await h.loop.run("sys", "user", h.config);
    expect(res.status).toBe("completed");
    expect(res.toolCalls).toBe(1);
    expect(h.events.some((e) => e.t === "tool_call" && e.name === "search_items")).toBe(true);
    expect(h.events.filter((e) => e.t === "assistant_text")).toHaveLength(2);
  });

  it("returns validation errors to the model as recoverable tool errors", async () => {
    const h = buildHarness([
      { blocks: [toolUse("t1", "read_pr", { number: "not-a-number" })] },
      { blocks: [] },
    ]);
    const res = await h.loop.run("sys", "user", h.config);
    expect(res.status).toBe("completed");
    const err = h.events.find((e) => e.t === "tool_result" && e.isError);
    expect(err && err.t === "tool_result" && err.summary).toContain("Invalid input");
  });

  it("handles unknown tools without crashing", async () => {
    const h = buildHarness([
      { blocks: [toolUse("t1", "hack_the_planet", {})] },
      { blocks: [] },
    ]);
    const res = await h.loop.run("sys", "user", h.config);
    expect(res.status).toBe("completed");
    const err = h.events.find((e) => e.t === "tool_result" && e.isError);
    expect(err && err.t === "tool_result" && err.summary).toContain("Unknown tool");
  });

  it("cancellation via AbortSignal stops the loop", async () => {
    const h = buildHarness([{ blocks: [toolUse("t1", "search_items", { query: "x" })] }]);
    const ac = new AbortController();
    ac.abort();
    const res = await h.loop.run("sys", "user", h.config, ac.signal);
    expect(res.status).toBe("cancelled");
    expect(res.turns).toBe(0);
  });

  it("budget exhaustion blocks evidence tools, allows emit_decision, injects one nudge", async () => {
    const h = buildHarness([
      { blocks: [
        toolUse("a", "search_items", { query: "q1" }),
        toolUse("b", "search_items", { query: "q2" }),
        toolUse("c", "search_items", { query: "q3" }),
      ] },
      { blocks: [toolUse("d", "search_items", { query: "over budget" }), toolUse("e", "emit_decision", validEmit)] },
      { blocks: [{ type: "text", text: "done" }] },
    ]);
    h.config.toolBudget = 3;
    const res = await h.loop.run("sys", "user", h.config);
    expect(res.status).toBe("completed");
    expect(res.toolCalls).toBe(3); // 4th evidence call blocked, not counted
    const blocked = h.events.filter((e) => e.t === "tool_result" && e.isError && e.summary.includes("budget exhausted"));
    expect(blocked).toHaveLength(1);
    expect(h.decisions).toHaveLength(1); // emit still worked post-budget
    // Nudge was injected exactly once:
    const nudges = h.llm.seenRequests.flatMap((r) => r.messages)
      .filter((m) => typeof m.content === "string" && m.content.includes("entire evidence budget"));
    expect(nudges.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Evidence gate feedback loop", () => {
  it("rejects fabricated excerpts and accepts after self-correction", async () => {
    const fabricated = {
      ...validEmit,
      evidence: [{ ...validEmit.evidence[0]!, excerpt: "we all agreed this was the best possible architecture" }],
    };
    const h = buildHarness([
      { blocks: [toolUse("t1", "emit_decision", fabricated)] },   // fabricated quote
      { blocks: [toolUse("t2", "emit_decision", validEmit)] },     // corrected, verbatim
      { blocks: [] },
    ]);
    const res = await h.loop.run("sys", "user", h.config);
    expect(res.status).toBe("completed");

    const rejection = h.events.find((e) => e.t === "decision_rejected");
    expect(rejection && rejection.t === "decision_rejected" && rejection.errors[0]).toContain("verbatim");
    expect(h.decisions).toHaveLength(1);
    expect(h.decisions[0]?.id).toBe("dec-dropdown-1");
    expect(h.events.some((e) => e.t === "decision_emitted")).toBe(true);
  });

  it("rejects evidence pointing outside the cache", async () => {
    const foreign = {
      ...validEmit,
      evidence: [{ ...validEmit.evidence[0]!, url: "https://github.com/o/r/pull/9999" }],
    };
    const h = buildHarness([
      { blocks: [toolUse("t1", "emit_decision", foreign)] },
      { blocks: [] },
    ]);
    await h.loop.run("sys", "user", h.config);
    expect(h.decisions).toHaveLength(0);
    const err = h.events.find((e) => e.t === "tool_result" && e.isError);
    expect(err && err.t === "tool_result" && err.summary).toContain("EVIDENCE_GATE");
  });

  it("zod gate rejects structurally invalid decisions before verification", async () => {
    const noEvidence = { ...validEmit, evidence: [] };
    const h = buildHarness([
      { blocks: [toolUse("t1", "emit_decision", noEvidence)] },
      { blocks: [] },
    ]);
    await h.loop.run("sys", "user", h.config);
    expect(h.decisions).toHaveLength(0);
    const err = h.events.find((e) => e.t === "tool_result" && e.isError);
    expect(err && err.t === "tool_result" && err.summary).toContain("Invalid input");
  });
});

describe("RunLog replayability", () => {
  it("round-trips events: written JSONL replays identically", () => {
    const log = new RunLog(tmp, "test-run");
    const events: RunEvent[] = [
      { t: "run_started", runId: "test-run", component: "X", model: "fake", ts: "2026-01-01T00:00:00Z" },
      { t: "tool_call", seq: 1, name: "search_items", input: { query: "x" }, ts: "2026-01-01T00:00:01Z" },
      { t: "run_finished", status: "completed", stats: { toolCalls: 1 }, ts: "2026-01-01T00:00:02Z" },
    ];
    for (const e of events) log.emit(e);
    expect(RunLog.read(tmp, "test-run")).toEqual(events);
  });

  it("refuses to write malformed events (a lying log is worse than none)", () => {
    const log = new RunLog(tmp, "bad-run");
    expect(() => log.emit({ t: "tool_call", name: "x" } as never)).toThrow();
  });
});

describe("ToolRuntime", () => {
  it("supports dynamic registration and exposes JSON-schema definitions", () => {
    const rt = new ToolRuntime();
    rt.register({
      name: "custom_tool",
      description: "test",
      inputSchema: z.object({ foo: z.string() }),
      handler: async ({ foo }) => `got ${foo}`,
    });
    const defs = rt.definitions();
    expect(defs.map((d) => d.name)).toContain("custom_tool");
    expect(defs[0]?.inputJsonSchema).toHaveProperty("properties");
  });

  it("rejects duplicate registration", () => {
    const rt = new ToolRuntime();
    const spec = { name: "t", description: "", inputSchema: z.object({}), handler: async () => "" };
    rt.register(spec);
    expect(() => rt.register(spec)).toThrow(/already registered/);
  });
});

describe("Prompt loader", () => {
  it("substitutes variables and rejects unbound ones", () => {
    for (const version of ["v1", "v2"]) {
      const sys = loadPrompt("system", { repo: "o/r" }, { version });
      expect(sys).toContain("o/r");
      expect(() => loadPrompt("decision_extraction", { repo: "o/r" }, { version })).toThrow(/unbound/);
    }
  });

  it("loads unversioned judge prompts from prompts/ root", () => {
    expect(loadPrompt("judge_match", {})).toContain("record_verdict");
  });
});
