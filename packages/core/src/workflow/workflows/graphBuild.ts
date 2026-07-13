/**
 * graph.build workflow — decisions → Decision Graph.
 *
 * Steps wrap existing services: `buildGraph` (deterministic construction) +
 * `JsonGraphStore` (idempotent upsert), then optionally the `LinkingAgent`.
 * No reasoning logic here — only sequencing.
 */

import { buildGraph } from "@dg/engine/graph/GraphBuilder.js";
import { LinkingAgent } from "@dg/engine/agent/LinkingAgent.js";
import type { DecisionObject } from "@dg/domain/types.js";
import type { Step } from "../Step.js";
import type { Workflow } from "../Workflow.js";

export interface GraphBuildInput {
  link?: boolean;
}
export interface GraphBuildOutput {
  nodes: number;
  edges: number;
  assertedEdges: number;
  linked?: { proposed: number; accepted: number; rejected: string[] };
}

const loadDecisions: Step<void, DecisionObject[]> = {
  id: "graph.loadDecisions",
  title: "Load decisions",
  idempotent: true,
  async run(_input, ctx) {
    const ws = ctx.workspace;
    return ws.stores().decisions().loadAll(ws.config.promptVersion);
  },
};

const buildStep: Step<DecisionObject[], { nodes: number; edges: number; asserted: number }> = {
  id: "graph.build",
  title: "Build graph nodes + edges",
  idempotent: true,
  async run(decisions, ctx) {
    const ws = ctx.workspace;
    const store = ws.stores().graph();
    const { nodes, edges } = buildGraph(ws.config.repo, decisions);
    for (const n of nodes) store.upsertNode(n);
    let asserted = 0;
    for (const e of edges) {
      store.addEdge(e);
      asserted++;
    }
    store.flush();
    return { nodes: store.nodes().length, edges: store.edges().length, asserted };
  },
};

const linkStep: Step<void, { proposed: number; accepted: number; rejected: string[] }> = {
  id: "graph.link",
  title: "Link decisions (SUPERSEDES / INFORMS)",
  idempotent: false,
  async run(_input, ctx) {
    const ws = ctx.workspace;
    const store = ws.stores().graph();
    const res = await new LinkingAgent(ws.llm(), store).run();
    store.flush();
    return res;
  },
};

export const graphBuildWorkflow: Workflow<GraphBuildInput, GraphBuildOutput> = {
  name: "graph.build",
  steps: [loadDecisions, buildStep, linkStep],
  async execute(input, ctx) {
    const decisions = await ctx.runStep(loadDecisions, undefined);
    const built = await ctx.runStep(buildStep, decisions);
    const linked = input.link ? await ctx.runStep(linkStep, undefined) : undefined;
    return {
      nodes: built.nodes,
      edges: built.edges,
      assertedEdges: built.asserted,
      ...(linked ? { linked } : {}),
    };
  },
};
