/**
 * tests/mcp-server.test.ts — Phase 3.4 protocol-level tests.
 *
 * Drives a real MCP client ↔ our real MCP server over the SDK's in-memory
 * transport, with faked DecisionGraphEngine + WorkspaceProvider + Workspace
 * (no GitHub / Anthropic / Ollama). Verifies: server starts, transport works,
 * tool + resource discovery, tool invocation, resource reads, progress
 * notifications.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "@dg/mcp";
import type { DecisionGraphEngine, EventSink, Workspace, WorkspaceProvider } from "@dg/core";

/* ------------------------------ test doubles ---------------------------- */

function fakeWorkspace(): Workspace {
  return {
    ref: "o/r",
    config: { repo: "o/r", model: "m", promptVersion: "v2", toolBudget: 25 },
    dataDir: () => "/tmp/.decisiongraph",
    connectors: () => [{ source: "github", config: { tokenEnv: "GITHUB_TOKEN" } }],
    stores: () => ({
      graph: () => ({ nodes: () => [], edges: () => [] }),
      decisions: () => ({ loadAll: () => [], loadComponent: () => [], save() {} }),
      sync: () => ({ write() {}, latest: () => undefined, list: () => [] }),
    }),
    runStore: () => ({ list: () => [] }),
  } as unknown as Workspace;
}

function fakeProvider(): WorkspaceProvider {
  const ws = fakeWorkspace();
  return { resolve: async () => ws, create: async () => ws, list: async () => ["o/r"] };
}

/** Fake engine: dg_ingest emits one connector progress event, then completes. */
function fakeEngine(): DecisionGraphEngine {
  return {
    async ingest(o: { sinks?: EventSink[] }) {
      o.sinks?.[0]?.({
        runId: "r", workflow: "ingest", seq: 0, ts: "t", level: "progress",
        payload: { kind: "connector", progress: { source: "github", message: "issues", current: 2, total: 2 } },
      });
      return { status: "completed", runId: "r1", events: 1, output: { source: "github", counts: { issues: 2 }, artifacts: 2, cursor: {}, complete: true } };
    },
    async extract() { return { status: "completed", runId: "r2", events: 0, output: { components: [] } }; },
    async buildGraph() { return { status: "completed", runId: "r3", events: 0, output: { nodes: 0, edges: 0, assertedEdges: 0 } }; },
    async link() { return { status: "completed", runId: "r4", events: 0, output: {} }; },
    async analyze() { return { status: "completed", events: 1, summary: { repo: "o/r", nodes: 0, edges: 0, decisions: 0 }, steps: {} }; },
    async evaluate() { return { status: "completed", runId: "r5", events: 0, output: { component: "x", metrics: {}, verdict: {} } }; },
    async ask() { return { status: "completed", runId: "ask-1", events: 1, answer: { answer: "x", certainty: "known", supportingDecisionIds: [], supportingEvidenceUrls: [], reasoningSummary: "r", missingEvidence: null } }; },
    async counterfactual() { return { status: "completed", runId: "cf-1", events: 0, answer: { answer: "maybe", certainty: "speculative", supportingDecisionIds: [], supportingEvidenceUrls: [], reasoningSummary: "r", missingEvidence: null } }; },
    async export() { return { status: "completed", runId: "r6", events: 0, output: { format: "json", content: "{}" } }; },
    async replay() { return { status: "completed", runId: "r7", events: 0, output: { events: 0 } }; },
  } as unknown as DecisionGraphEngine;
}

async function connectedClient(): Promise<Client> {
  const { server } = createServer({ provider: fakeProvider(), engine: fakeEngine(), dataDir: "/tmp/.decisiongraph" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

let client: Client;
beforeEach(async () => { client = await connectedClient(); });
afterEach(async () => { await client.close(); });

/* --------------------------------- tests -------------------------------- */

describe("MCP server (protocol level)", () => {
  it("starts and completes the handshake (server info)", () => {
    expect(client.getServerVersion()?.name).toBe("decision-graph");
  });

  it("tool discovery lists all tools with input schemas", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "dg_analyze", "dg_ask", "dg_counterfactual", "dg_doctor", "dg_evaluate",
      "dg_export", "dg_extract", "dg_graph", "dg_ingest", "dg_link", "dg_replay",
    ]);
    const ingest = tools.find((t) => t.name === "dg_ingest")!;
    expect(ingest.inputSchema.properties).toHaveProperty("workspace");
  });

  it("resource discovery lists the five resources", async () => {
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri).sort();
    expect(uris).toEqual([
      "decisiongraph://decisions",
      "decisiongraph://graph",
      "decisiongraph://runs",
      "decisiongraph://sync",
      "decisiongraph://workspace/current",
    ]);
  });

  it("invokes a tool and returns structured content", async () => {
    const res = await client.callTool({ name: "dg_ingest", arguments: { workspace: "o/r" } });
    expect((res.structuredContent as { status: string }).status).toBe("completed");
    expect(res.isError).toBeFalsy();
  });

  it("reads a resource (JSON contents)", async () => {
    const res = await client.readResource({ uri: "decisiongraph://graph" });
    const first = res.contents[0] as { mimeType?: string; text: string };
    expect(first.mimeType).toBe("application/json");
    expect(JSON.parse(first.text)).toMatchObject({ nodeCount: 0, edgeCount: 0 });
  });

  it("forwards WorkflowEvents as MCP progress notifications", async () => {
    const progress: Array<{ progress: number; total?: number }> = [];
    const res = await client.callTool(
      { name: "dg_ingest", arguments: { workspace: "o/r" } },
      undefined,
      { onprogress: (p) => progress.push(p) }
    );
    expect((res.structuredContent as { status: string }).status).toBe("completed");
    expect(progress.length).toBeGreaterThan(0);
    expect(progress[0]).toMatchObject({ total: 2 });
  });
});
