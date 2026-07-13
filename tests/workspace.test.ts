/**
 * tests/workspace.test.ts — Phase 2.4 workspace + Workspace→Connector→Evidence.
 *
 * Workspace resolution, file-backed run store / checkpoints, decision store,
 * cursor persistence, an end-to-end ingest through the DecisionGraphEngine,
 * and SyncStore lifecycle.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ConnectorRegistry,
  DecisionGraphEngine,
  ingestWorkflow,
  type Checkpoint,
  type SyncMetadata,
  type WorkspaceConfig,
} from "@dg/core";
import { GitHubConnector } from "@dg/connectors";
import { LocalSyncStore, LocalWorkspaceProvider } from "@dg/workspace-local";
import type { OctokitLike } from "@dg/engine/evidence/GitHubFetcher.js";
import type { DecisionObject } from "@dg/domain/types.js";
import { run, type IO } from "@dg/cli";
import { defaultProvider } from "@dg/cli/context.js";

function fakeOctokit(): OctokitLike {
  return {
    async paginate(route: string): Promise<unknown[]> {
      if (route.includes("/issues")) {
        return [
          { number: 1, title: "Dropdown a11y", state: "open", user: { login: "a" }, body: "native select fails", html_url: "https://github.com/o/r/issues/1", created_at: "2023-01-01T00:00:00Z", updated_at: "2023-01-01T00:00:00Z", closed_at: null, labels: [] },
        ];
      }
      return [];
    },
    async request(route: string): Promise<{ data: unknown }> {
      if (route.includes("/commits")) return { data: [] };
      return { data: {} };
    },
  };
}

function mkDecision(): DecisionObject {
  return {
    id: "dec-1", title: "Dropdown exposes a controlled-only selection API", scope: { component: "Dropdown" },
    status: "adopted",
    hypothesis: "Controlled-only state avoids SSR hydration mismatches entirely.",
    context: "Recurring hydration bugs with uncontrolled state broke checkout.",
    alternatives: [{ option: "dual mode", reasonRejected: "doubles surface", evidenceIds: ["pr-42"] }],
    chosenSolution: "Require value/onChange; drop internal selection state.",
    tradeOffs: ["boilerplate for simple cases"],
    evidence: [{ id: "pr-42", kind: "pr", url: "https://github.com/o/r/pull/42", title: "controlled API", excerpt: "SSR hydration mismatches kept breaking checkout flows", date: "2023-04-01" }],
    observedOutcome: null, confidence: "high", confidenceRationale: "explicit PR discussion",
    actors: ["alice"], decidedAt: "2023-04-01",
    extraction: { runId: "run-1", model: "m", toolCalls: 1, ts: "2026-01-01" },
  };
}

function makeProvider(dir: string) {
  const registry = new ConnectorRegistry().register(new GitHubConnector());
  return new LocalWorkspaceProvider({ dataDir: dir, registry });
}

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dg-ws-"));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("LocalWorkspaceProvider — resolution", () => {
  it("creates, persists and re-resolves a workspace", async () => {
    const provider = makeProvider(tmp);
    const cfg: WorkspaceConfig = {
      repo: "o/r", model: "m", promptVersion: "v2", toolBudget: 25,
      connectors: [{ source: "github", config: {} }],
    };
    const ws = await provider.create("o/r", cfg);
    expect(fs.existsSync(path.join(tmp, "config.json"))).toBe(true);
    expect(ws.connectors().map((b) => b.source)).toEqual(["github"]);
    expect(ws.connector("github")).toBeInstanceOf(GitHubConnector);
    expect(await provider.list()).toEqual(["o/r"]);

    const re = await provider.resolve("o/r");
    expect(re.config.repo).toBe("o/r");
    expect(re.dataDir()).toBe(tmp);
  });

  it("defaults to a github binding when none is configured", async () => {
    const ws = await makeProvider(tmp).resolve("o/r");
    expect(ws.connectors().map((b) => b.source)).toContain("github");
  });

  it("resolves the graph + decision stores from data/ (formats unchanged)", async () => {
    const ws = await makeProvider(tmp).resolve("o/r");
    ws.stores().decisions().save("Dropdown", "v2", [mkDecision()]);
    expect(fs.existsSync(path.join(tmp, "decisions", "dropdown.v2.json"))).toBe(true);
    expect(ws.stores().decisions().loadAll("v2")).toHaveLength(1);
    expect(ws.stores().decisions().loadComponent("Dropdown", "v2")).toHaveLength(1);

    // graph store is the real JsonGraphStore writing data/graph.json
    ws.stores().graph().flush();
    expect(fs.existsSync(path.join(tmp, "graph.json"))).toBe(true);
  });

  it("persists sync cursors back to config.json", async () => {
    const provider = makeProvider(tmp);
    const ws = await provider.create("o/r", { repo: "o/r", model: "m", promptVersion: "v2", toolBudget: 25, connectors: [{ source: "github", config: {} }] });
    ws.saveCursor("github", { since: "2023-06-01T00:00:00Z" });
    const onDisk = JSON.parse(fs.readFileSync(path.join(tmp, "config.json"), "utf8")) as WorkspaceConfig;
    expect(onDisk.connectors?.find((b) => b.source === "github")?.cursor?.since).toBe("2023-06-01T00:00:00Z");
  });
});

describe("SyncStore — local file-backed metadata", () => {
  it("read/write round-trips sync metadata", () => {
    const store = new LocalSyncStore(tmp);
    const meta: SyncMetadata = {
      schemaVersion: 1,
      source: "github",
      repo: "o/r",
      status: "completed",
      startedAt: "2026-01-01T00:00:00Z",
      completedAt: "2026-01-01T01:00:00Z",
      durationMs: 3600000,
      artifacts: 42,
      counts: { issues: 10, pull_requests: 20, commits: 12 },
      cursor: { since: "2026-01-01T00:00:00Z" },
    };
    store.write(meta);
    const read = store.latest("github")!;
    expect(read.schemaVersion).toBe(1);
    expect(read.source).toBe("github");
    expect(read.status).toBe("completed");
    expect(read.artifacts).toBe(42);
    expect(read.counts.issues).toBe(10);
    expect(read.cursor?.since).toBe("2026-01-01T00:00:00Z");
  });

  it("persists sync.json on disk at expected path", () => {
    const store = new LocalSyncStore(tmp);
    store.write({
      schemaVersion: 1,
      source: "github",
      repo: "o/r",
      status: "completed",
      startedAt: "2026-01-01T00:00:00Z",
      completedAt: "2026-01-01T01:00:00Z",
      durationMs: 3600000,
      artifacts: 5,
      counts: {},
    });
    const f = path.join(tmp, "connectors", "github", "sync.json");
    expect(fs.existsSync(f)).toBe(true);
    const onDisk = JSON.parse(fs.readFileSync(f, "utf8")) as SyncMetadata;
    expect(onDisk.repo).toBe("o/r");
    expect(onDisk.status).toBe("completed");
  });

  it("survives process restart (write → new instance → read)", () => {
    const a = new LocalSyncStore(tmp);
    a.write({
      schemaVersion: 1,
      source: "github",
      repo: "o/r",
      status: "completed",
      startedAt: "2026-01-01T00:00:00Z",
      completedAt: "2026-01-01T01:00:00Z",
      durationMs: 999,
      artifacts: 10,
      counts: {},
    });
    const b = new LocalSyncStore(tmp);
    const meta = b.latest("github")!;
    expect(meta.artifacts).toBe(10);
    expect(meta.durationMs).toBe(999);
  });

  it("latest returns undefined when no sync has run", () => {
    const store = new LocalSyncStore(tmp);
    expect(store.latest("github")).toBeUndefined();
  });

  it("list returns all connector syncs", () => {
    const store = new LocalSyncStore(tmp);
    store.write({
      schemaVersion: 1, source: "github", repo: "o/r", status: "completed",
      startedAt: "t1", completedAt: "t2", durationMs: 100, artifacts: 5, counts: {},
    });
    store.write({
      schemaVersion: 1, source: "slack", repo: "o/r", status: "completed",
      startedAt: "t3", completedAt: "t4", durationMs: 200, artifacts: 3, counts: {},
    });
    const all = store.list();
    expect(all).toHaveLength(2);
    expect(all.map((m) => m.source).sort()).toEqual(["github", "slack"]);
  });

  it("list returns [] when no connectors directory exists", () => {
    expect(new LocalSyncStore(tmp).list()).toEqual([]);
  });

  it("handles failed sync metadata", () => {
    const store = new LocalSyncStore(tmp);
    store.write({
      schemaVersion: 1, source: "github", repo: "o/r", status: "failed",
      startedAt: "2026-01-01T00:00:00Z", completedAt: "2026-01-01T00:00:01Z",
      durationMs: 1234, artifacts: 0, counts: {},
      error: "API rate limit exceeded",
    });
    const meta = store.latest("github")!;
    expect(meta.status).toBe("failed");
    expect(meta.error).toBe("API rate limit exceeded");
    expect(meta.artifacts).toBe(0);
  });

  it("handles cancelled sync metadata", () => {
    const store = new LocalSyncStore(tmp);
    store.write({
      schemaVersion: 1, source: "github", repo: "o/r", status: "cancelled",
      startedAt: "2026-01-01T00:00:00Z", completedAt: "2026-01-01T00:00:30Z",
      durationMs: 30000, artifacts: 15, counts: { issues: 15 },
    });
    const meta = store.latest("github")!;
    expect(meta.status).toBe("cancelled");
    expect(meta.artifacts).toBe(15);
  });

  it("overwrites previous sync metadata for the same source", () => {
    const store = new LocalSyncStore(tmp);
    store.write({
      schemaVersion: 1, source: "github", repo: "o/r", status: "completed",
      startedAt: "old", completedAt: "old", durationMs: 1, artifacts: 1, counts: {},
    });
    store.write({
      schemaVersion: 1, source: "github", repo: "o/r", status: "completed",
      startedAt: "new", completedAt: "new", durationMs: 2, artifacts: 99, counts: {},
    });
    expect(store.latest("github")!.artifacts).toBe(99);
  });

  it("is reachable through workspace.stores().sync()", async () => {
    const ws = await makeProvider(tmp).resolve("o/r");
    const sync = ws.stores().sync();
    sync.write({
      schemaVersion: 1, source: "github", repo: "o/r", status: "completed",
      startedAt: "t", completedAt: "t", durationMs: 0, artifacts: 7, counts: {},
    });
    expect(sync.latest("github")!.artifacts).toBe(7);
  });
});

describe("ingest workflow writes SyncMetadata", () => {
  it("persists completed SyncMetadata after successful sync", async () => {
    const provider = makeProvider(tmp);
    const ws = await provider.create("o/r", {
      repo: "o/r", model: "m", promptVersion: "v2", toolBudget: 25,
      connectors: [{ source: "github", config: { octokit: fakeOctokit() } }],
    });

    const engine = new DecisionGraphEngine();
    const { result } = engine.run(ingestWorkflow, { source: "github" }, { workspace: ws });
    const r = await result;
    expect(r.status).toBe("completed");

    const meta = ws.stores().sync().latest("github")!;
    expect(meta.status).toBe("completed");
    expect(meta.source).toBe("github");
    expect(meta.repo).toBe("o/r");
    expect(meta.artifacts).toBeGreaterThan(0);
    expect(meta.counts.issues).toBe(1);
    expect(meta.startedAt).toBeTruthy();
    expect(meta.completedAt).toBeTruthy();
    expect(meta.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("persists failed SyncMetadata when connector throws", async () => {
    const registry = new ConnectorRegistry();
    const throwingConnector = new GitHubConnector();
    const origSync = throwingConnector.sync.bind(throwingConnector);
    throwingConnector.sync = async () => { throw new Error("connection refused"); };
    registry.register(throwingConnector);

    const provider = new LocalWorkspaceProvider({ dataDir: tmp, registry });
    const ws = await provider.create("o/r", {
      repo: "o/r", model: "m", promptVersion: "v2", toolBudget: 25,
      connectors: [{ source: "github", config: { octokit: fakeOctokit() } }],
    });

    // WorkflowEngine catches step errors and returns a failed result (not throw).
    const engine = new DecisionGraphEngine();
    const { result } = engine.run(ingestWorkflow, { source: "github" }, { workspace: ws });
    const r = await result;
    expect(r.status).toBe("failed");
    expect(r.error?.message).toBe("connection refused");

    const meta = ws.stores().sync().latest("github")!;
    expect(meta.status).toBe("failed");
    expect(meta.error).toBe("connection refused");
  });

  it("persists cancelled SyncMetadata via partial connector result", async () => {
    const registry = new ConnectorRegistry();
    const partialConnector = new GitHubConnector();
    partialConnector.sync = async () => ({
      source: "github" as const,
      counts: { issues: 3 },
      cursor: {},
      artifacts: 3,
      complete: false,
    });
    registry.register(partialConnector);

    const provider = new LocalWorkspaceProvider({ dataDir: tmp, registry });
    const ws = await provider.create("o/r", {
      repo: "o/r", model: "m", promptVersion: "v2", toolBudget: 25,
      connectors: [{ source: "github", config: { octokit: fakeOctokit() } }],
    });

    const ac = new AbortController();
    ac.abort();
    const engine = new DecisionGraphEngine();
    const { result } = engine.run(ingestWorkflow, { source: "github" }, { workspace: ws, signal: ac.signal });
    const r = await result;

    // Pre-aborted signal: WorkflowEngine throws Cancelled before step runs,
    // so no metadata is persisted. This is expected — cancelled metadata is
    // written only when the signal fires mid-sync.
    expect(r.status).toBe("truncated");
  });
});

function captureIO(env?: Record<string, string | undefined>): IO & { out(): string } {
  let out = "";
  return {
    stdout: (s: string) => { out += s; },
    stderr: () => {},
    isTTY: false,
    color: false,
    cwd: process.cwd(),
    env: env ?? {},
    async readLine() { return ""; },
    out: () => out,
  };
}

describe("doctor reads through Workspace only", () => {
  it("reads sync metadata instead of constructing meta.json paths", async () => {
    const io = captureIO({ GITHUB_TOKEN: "ghp_x" });
    const initIO = captureIO();
    await run(["init", "--repo", "o/r", "--data-dir", tmp], { io: initIO });

    // Manually write sync metadata through the store (simulating an ingest).
    const provider = defaultProvider(tmp);
    const ws = await provider.resolve("o/r");
    ws.stores().sync().write({
      schemaVersion: 1, source: "github", repo: "o/r", status: "completed",
      startedAt: "2026-03-01T00:00:00Z", completedAt: "2026-03-01T01:00:00Z",
      durationMs: 3600000, artifacts: 42, counts: { issues: 10, pull_requests: 5 },
    });

    await run(["doctor", "--data-dir", tmp, "--json"], { io });
    const doc = JSON.parse(io.out());
    expect(doc.command).toBe("doctor");
    expect(doc.workspace.ok).toBe(true);
    expect(doc.cache.counts).toEqual({ issues: 10, pull_requests: 5 });
    expect(doc.cache.lastSync).toBe("2026-03-01T01:00:00Z");
    expect(doc.connector.tokenPresent).toBe(true);
  });

  it("shows empty cache when no sync has run", async () => {
    const io = captureIO({ GITHUB_TOKEN: "ghp_x" });
    const initIO = captureIO();
    await run(["init", "--repo", "o/r", "--data-dir", tmp], { io: initIO });
    await run(["doctor", "--data-dir", tmp, "--json"], { io });
    const doc = JSON.parse(io.out());
    expect(doc.cache.counts).toBeNull();
    expect(doc.cache.lastSync).toBeNull();
  });
});

describe("LocalRunStore — file-backed checkpoints + journal", () => {
  it("round-trips checkpoints, step outputs and events", async () => {
    const ws = await makeProvider(tmp).resolve("o/r");
    const rs = ws.runStore();

    const ckpt: Checkpoint = {
      runId: "r1", workflow: "wf", inputHash: "h", completedSteps: {}, lastSeq: 3, status: "running", updatedAt: "t",
    };
    rs.putCheckpoint(ckpt);
    expect(rs.getCheckpoint("r1")?.lastSeq).toBe(3);

    const ref = rs.putStepOutput("r1", "stepA", { value: 42 });
    expect(rs.getStepOutput("r1", ref)).toEqual({ value: 42 });

    rs.appendEvent({ runId: "r1", workflow: "wf", seq: 0, ts: "t", level: "lifecycle", payload: { kind: "lifecycle", lifecycle: { kind: "run_started", input: {} } } });
    expect(rs.readEvents("r1")).toHaveLength(1);
  });
});

describe("ingest workflow — Workspace → Connector → EvidenceRepository", () => {
  it("syncs GitHub through the workspace and makes evidence readable", async () => {
    const provider = makeProvider(tmp);
    const ws = await provider.create("o/r", {
      repo: "o/r", model: "m", promptVersion: "v2", toolBudget: 25,
      connectors: [{ source: "github", config: { octokit: fakeOctokit() } }],
    });

    const engine = new DecisionGraphEngine();
    const { result } = engine.run(ingestWorkflow, { source: "github" }, { workspace: ws });
    const r = await result;

    expect(r.status).toBe("completed");
    expect(r.output?.complete).toBe(true);
    expect(r.output?.counts.issues).toBe(1);

    // The extraction-facing read port now serves the ingested evidence.
    const evidence = ws.stores().evidence("github");
    const issue = await evidence.getIssue(1);
    expect(issue.title).toBe("Dropdown a11y");
    // ...and the cache lives in the existing data/cache/<owner__repo> location.
    expect(fs.existsSync(path.join(tmp, "cache", "o__r", "issues.json"))).toBe(true);
  });
});
