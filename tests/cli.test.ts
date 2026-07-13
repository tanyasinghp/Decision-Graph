/**
 * tests/cli.test.ts — Phase 2.7 CLI.
 *
 * Command parsing, renderers (TTY + JSON), interactive ask, SIGINT-style
 * cancellation (aborted signal), resume messaging, progress rendering, and the
 * doctor command. Real-provider commands (init/connect/workspace/doctor) run
 * against a temp data dir; engine-backed commands use a fake engine so no real
 * workflow runs.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { run } from "@dg/cli";
import { parseArgs } from "@dg/cli/args.js";
import { styler } from "@dg/cli/io.js";
import { ProgressReporter } from "@dg/cli/render/progress.js";
import type { IO } from "@dg/cli";
import type { DecisionGraphEngine, Workspace, WorkspaceProvider, WorkflowEvent } from "@dg/core";

/* ------------------------------ test doubles ---------------------------- */

interface Capture extends IO {
  out(): string;
  errOut(): string;
}
function captureIO(opts: { env?: Record<string, string | undefined>; answer?: string } = {}): Capture {
  let out = "";
  let err = "";
  return {
    stdout: (s) => { out += s; },
    stderr: (s) => { err += s; },
    isTTY: false,
    color: false,
    cwd: process.cwd(),
    env: opts.env ?? {},
    async readLine() { return opts.answer ?? ""; },
    out: () => out,
    errOut: () => err,
  };
}

function fakeWorkspace(repo = "o/r"): Workspace {
  return { config: { repo, model: "m", promptVersion: "v2", toolBudget: 25 } } as unknown as Workspace;
}
function fakeProvider(repo = "o/r"): WorkspaceProvider {
  const ws = fakeWorkspace(repo);
  return { resolve: async () => ws, create: async () => ws, list: async () => [repo] };
}

/** Fake engine: canned results; records the last options it received. */
function fakeEngine(over: Record<string, unknown> = {}): { engine: DecisionGraphEngine; last: Record<string, unknown> } {
  const last: Record<string, unknown> = {};
  const base = {
    async ingest(o: Record<string, unknown>) { last.ingest = o; return over.ingest ?? { status: "completed", runId: "r1", events: 3, output: { source: "github", counts: { issues: 2, prs: 1, commits: 5 }, artifacts: 8, cursor: {}, complete: true } }; },
    async extract(o: Record<string, unknown>) { last.extract = o; return { status: "completed", events: 4, output: { components: [{ component: "Dropdown", decisions: [{ confidence: "high" }, { confidence: "medium" }], stats: { costUsd: 0.12 }, status: "completed" }] } }; },
    async buildGraph(o: Record<string, unknown>) { last.buildGraph = o; return { status: "completed", events: 4, output: { nodes: 10, edges: 20, assertedEdges: 20, linked: { proposed: 3, accepted: 2, rejected: [] } } }; },
    async ask(o: Record<string, unknown>) { last.ask = o; return { status: "completed", runId: "ask-42", events: 2, answer: { answer: "Because uncontrolled state caused SSR hydration bugs.", certainty: "known", supportingDecisionIds: ["d1"], supportingEvidenceUrls: ["https://x/pr/42"], reasoningSummary: "One decision answers it.", missingEvidence: null }, reasoning: { intent: "causal", matchedRule: "why" }, evidence: ["d1"] }; },
    async replay(o: Record<string, unknown>) { last.replay = o; return { status: "completed", events: 5, output: { events: 3 } }; },
    async export(o: Record<string, unknown>) { last.export = o; return { status: "completed", output: { format: "mermaid", content: "flowchart TD\n  a --> b" } }; },
    async analyze(o: Record<string, unknown>) { last.analyze = o; return { status: "completed", events: 12, summary: { repo: "o/r", nodes: 10, edges: 20, decisions: 2 }, steps: { ingest: { output: { counts: { commits: 5, issues: 2, prs: 1 } } }, extract: { output: { components: [{ decisions: [{ confidence: "high" }, { confidence: "low" }] }] } } } }; },
  };
  return { engine: { ...base, ...over } as unknown as DecisionGraphEngine, last };
}

let tmp: string;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dg-cli-")); });
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

/* -------------------------------- parsing ------------------------------- */

describe("arg parsing", () => {
  it("splits positionals, flags and bools", () => {
    const a = parseArgs(["ingest", "github", "--repo", "o/r", "--json"]);
    expect(a.positionals).toEqual(["ingest", "github"]);
    expect(a.flags.get("repo")).toBe("o/r");
    expect(a.bools.has("json")).toBe(true);
  });
});

describe("dispatch basics", () => {
  it("prints help with no command", async () => {
    const io = captureIO();
    expect(await run([], { io })).toBe(0);
    expect(io.out()).toContain("Decision Graph CLI");
  });
  it("prints version", async () => {
    const io = captureIO();
    await run(["version"], { io });
    expect(io.out()).toMatch(/dg \d+\.\d+\.\d+/);
  });
  it("rejects unknown commands with exit 2", async () => {
    const io = captureIO();
    expect(await run(["frobnicate"], { io })).toBe(2);
    expect(io.errOut()).toContain("Unknown command");
  });
});

/* ---------------------------- real-provider ----------------------------- */

describe("init / doctor / connect / workspace (real provider)", () => {
  it("init creates the workspace manifest + cache structure", async () => {
    const io = captureIO();
    expect(await run(["init", "--repo", "o/r", "--data-dir", tmp], { io })).toBe(0);
    expect(fs.existsSync(path.join(tmp, "config.json"))).toBe(true);
    expect(fs.existsSync(path.join(tmp, "cache"))).toBe(true);
    expect(io.out()).toContain("Initialized");
  });

  it("doctor reports workspace + connector health (json)", async () => {
    await run(["init", "--repo", "o/r", "--data-dir", tmp], { io: captureIO() });
    const io = captureIO({ env: { GITHUB_TOKEN: "ghp_x" } });
    await run(["doctor", "--data-dir", tmp, "--json"], { io });
    const doc = JSON.parse(io.out());
    expect(doc.command).toBe("doctor");
    expect(doc.workspace.ok).toBe(true);
    expect(doc.connector.tokenPresent).toBe(true);
    expect(doc.engineVersion).toBeTruthy();
  });

  it("connect github stores the binding", async () => {
    await run(["init", "--repo", "o/r", "--data-dir", tmp], { io: captureIO() });
    const io = captureIO({ env: { GH_TOK: "x" } });
    expect(await run(["connect", "github", "--data-dir", tmp, "--token-env", "GH_TOK"], { io })).toBe(0);
    const cfg = JSON.parse(fs.readFileSync(path.join(tmp, "config.json"), "utf8"));
    expect(cfg.connectors.find((b: { source: string }) => b.source === "github").config.tokenEnv).toBe("GH_TOK");
  });

  it("workspace list/current", async () => {
    await run(["init", "--repo", "o/r", "--data-dir", tmp], { io: captureIO() });
    const io = captureIO();
    await run(["workspace", "list", "--data-dir", tmp], { io });
    expect(io.out()).toContain("o/r");
  });
});

/* --------------------------- engine-backed ------------------------------ */

describe("engine-backed commands (fake engine)", () => {
  it("ingest renders a summary and exits 0", async () => {
    const io = captureIO();
    const { engine } = fakeEngine();
    expect(await run(["ingest", "--repo", "o/r"], { io, engine, provider: fakeProvider() })).toBe(0);
    expect(io.out()).toContain("Ingested 8 artifacts");
  });

  it("--json emits a machine-readable result on stdout", async () => {
    const io = captureIO();
    const { engine } = fakeEngine();
    await run(["ingest", "--repo", "o/r", "--json"], { io, engine, provider: fakeProvider() });
    const res = JSON.parse(io.out());
    expect(res).toMatchObject({ command: "ingest", status: "completed" });
  });

  it("ask (non-interactive) renders answer, evidence, confidence, replay id", async () => {
    const io = captureIO();
    const { engine } = fakeEngine();
    await run(["ask", "--repo", "o/r", "Why", "controlled", "only"], { io, engine, provider: fakeProvider() });
    const o = io.out();
    expect(o).toContain("Answer");
    expect(o).toContain("Confidence");
    expect(o).toContain("known");
    expect(o).toContain("Replay ID: ask-42");
  });

  it("ask (interactive) reads the question from stdin", async () => {
    const io = captureIO({ answer: "Why is Dropdown controlled only?" });
    const { engine, last } = fakeEngine();
    await run(["ask", "--repo", "o/r"], { io, engine, provider: fakeProvider() });
    expect((last.ask as { question: string }).question).toBe("Why is Dropdown controlled only?");
  });

  it("analyze prints a repository summary", async () => {
    const io = captureIO();
    const { engine } = fakeEngine();
    expect(await run(["analyze", "--repo", "o/r", "--component", "Dropdown"], { io, engine, provider: fakeProvider() })).toBe(0);
    expect(io.out()).toContain("Repository Summary");
    expect(io.out()).toContain("Decisions");
  });

  it("export writes content to stdout", async () => {
    const io = captureIO();
    const { engine } = fakeEngine();
    await run(["export", "mermaid", "--repo", "o/r"], { io, engine, provider: fakeProvider() });
    expect(io.out()).toContain("flowchart");
  });

  it("cancellation (aborted signal) → exit 4 + resume hint", async () => {
    const io = captureIO();
    const ac = new AbortController();
    ac.abort();
    const { engine } = fakeEngine({
      async ingest() { return { status: "truncated", runId: "r-1", events: 1 }; },
    });
    const code = await run(["ingest", "--repo", "o/r"], { io, engine, provider: fakeProvider(), signal: ac.signal });
    expect(code).toBe(4);
    expect(io.out()).toContain("Resume with");
    expect(io.out()).toContain("r-1");
  });

  it("passes resume options through to the engine", async () => {
    const io = captureIO();
    const { engine, last } = fakeEngine();
    await run(["ingest", "--repo", "o/r", "--resume", "--run", "r-1"], { io, engine, provider: fakeProvider() });
    expect((last.ingest as { resume?: { mode: string; runId: string } }).resume).toEqual({ mode: "resume", runId: "r-1" });
  });
});

/* ------------------------------- renderers ------------------------------ */

describe("renderers", () => {
  it("styler is a no-op when color is disabled", () => {
    const s = styler(false);
    expect(s.green("x")).toBe("x");
    const c = styler(true);
    expect(c.green("x")).not.toBe("x");
  });

  it("ProgressReporter renders committed checklist lines from WorkflowEvents", () => {
    const io = captureIO();
    const r = new ProgressReporter(io, false);
    const ev = (payload: WorkflowEvent["payload"]): WorkflowEvent => ({ runId: "r", workflow: "ingest", seq: 0, ts: "t", level: "lifecycle", payload });
    r.sink(ev({ kind: "lifecycle", lifecycle: { kind: "step_started", step: "s", title: "Synchronize source" } }));
    r.sink(ev({ kind: "connector", progress: { source: "github", message: "issues", current: 2, total: 2 } }));
    r.sink(ev({ kind: "lifecycle", lifecycle: { kind: "step_finished", step: "s", ok: true, ms: 120 } }));
    r.finish();
    expect(io.out()).toContain("Reading Issues");
    expect(io.out()).toContain("✓");
    expect(io.out()).toContain("Synchronize source");
  });

  it("ProgressReporter streams JSONL to stderr in json mode", () => {
    const io = captureIO();
    const r = new ProgressReporter(io, true);
    r.sink({ runId: "r", workflow: "ingest", seq: 0, ts: "t", level: "lifecycle", payload: { kind: "lifecycle", lifecycle: { kind: "run_started", input: {} } } });
    expect(io.out()).toBe("");
    expect(io.errOut()).toContain('"kind":"lifecycle"');
  });
});
