/**
 * Tool registry — all MCP tools as thin presentation over
 * DecisionGraphEngine:
 *
 *   dg_doctor · dg_ingest · dg_extract · dg_graph · dg_link ·
 *   dg_analyze · dg_evaluate · dg_ask · dg_counterfactual ·
 *   dg_export · dg_replay
 *
 * `toolHandlers` are the callable handlers; the real MCP server (server.ts)
 * registers them against the SDK. Handlers are never rewritten here.
 */

import { dgDoctor } from "./tools/doctor.js";
import { dgIngest } from "./tools/ingest.js";
import { dgExtract } from "./tools/extract.js";
import { dgGraph } from "./tools/graph.js";
import { dgLink } from "./tools/link.js";
import { dgAnalyze } from "./tools/analyze.js";
import { dgEvaluate } from "./tools/evaluate.js";
import { dgAsk } from "./tools/ask.js";
import { dgCounterfactual } from "./tools/counterfactual.js";
import { dgExport } from "./tools/export.js";
import { dgReplay } from "./tools/replay.js";
import type { ToolDefinition, ToolHandler } from "./tools/types.js";

export const toolHandlers = {
  dg_doctor: dgDoctor,
  dg_ingest: dgIngest,
  dg_extract: dgExtract,
  dg_graph: dgGraph,
  dg_link: dgLink,
  dg_analyze: dgAnalyze,
  dg_evaluate: dgEvaluate,
  dg_ask: dgAsk,
  dg_counterfactual: dgCounterfactual,
  dg_export: dgExport,
  dg_replay: dgReplay,
} satisfies Record<string, ToolHandler<never>>;

export const toolDefinitions: ToolDefinition[] = [
  { name: "dg_doctor", description: "Workspace / connector / graph health as structured JSON." },
  { name: "dg_ingest", description: "Synchronize a connector into the workspace." },
  { name: "dg_extract", description: "Extract decisions for specific components from ingested data." },
  { name: "dg_graph", description: "Build the decision graph from extracted components." },
  { name: "dg_link", description: "Link extracted decisions across the graph." },
  { name: "dg_analyze", description: "ingest → extract → graph → link; returns a repository summary." },
  { name: "dg_evaluate", description: "Evaluate ground-truth coverage for a specific component." },
  { name: "dg_ask", description: "Ask the Decision Graph a question; returns answer + reasoning + evidence." },
  { name: "dg_counterfactual", description: "Ask a counterfactual question against the decision graph." },
  { name: "dg_export", description: "Export the graph in json, graphml, or mermaid format." },
  { name: "dg_replay", description: "Replay a previous run from its run ID." },
];
