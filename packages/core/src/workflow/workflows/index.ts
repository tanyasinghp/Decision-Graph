/**
 * Built-in workflow catalog. Each workflow orchestrates existing engine
 * services only — extraction, graph construction, linking, query, evaluation,
 * replay.
 */

import { WorkflowCatalog } from "../WorkflowCatalog.js";
import { ingestWorkflow } from "./ingest.js";
import { extractWorkflow } from "./extract.js";
import { graphBuildWorkflow } from "./graphBuild.js";
import { linkWorkflow } from "./link.js";
import { queryWorkflow } from "./query.js";
import { evaluateWorkflow } from "./evaluate.js";
import { replayWorkflow } from "./replay.js";
import { exportWorkflow } from "./export.js";

export function defaultCatalog(): WorkflowCatalog {
  return new WorkflowCatalog()
    .register(ingestWorkflow)
    .register(extractWorkflow)
    .register(graphBuildWorkflow)
    .register(linkWorkflow)
    .register(queryWorkflow)
    .register(evaluateWorkflow)
    .register(replayWorkflow)
    .register(exportWorkflow);
}

export { ingestWorkflow } from "./ingest.js";
export type { IngestInput, IngestOutput } from "./ingest.js";
export { extractWorkflow } from "./extract.js";
export type { ExtractInput, ExtractOutput, ComponentExtraction } from "./extract.js";
export { graphBuildWorkflow } from "./graphBuild.js";
export type { GraphBuildInput, GraphBuildOutput } from "./graphBuild.js";
export { linkWorkflow } from "./link.js";
export type { LinkInput, LinkOutput } from "./link.js";
export { queryWorkflow } from "./query.js";
export type { QueryInput, QueryOutput } from "./query.js";
export { evaluateWorkflow } from "./evaluate.js";
export type { EvaluateInput, EvaluateOutput } from "./evaluate.js";
export { replayWorkflow } from "./replay.js";
export type { ReplayInput, ReplayOutput } from "./replay.js";
export { exportWorkflow } from "./export.js";
export type { ExportInput, ExportOutput, ExportFormat } from "./export.js";
