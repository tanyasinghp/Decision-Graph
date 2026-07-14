/**
 * Resource registry — Phase 3.3 implements the first five read-only resources.
 * Each resolves the current workspace and reads through Workspace/Stores
 * abstractions only (no filesystem, no engine internals, no mutation):
 *
 *   decisiongraph://workspace/current · decisiongraph://sync
 *   decisiongraph://graph · decisiongraph://decisions · decisiongraph://runs
 *
 * `resourceHandlers` is the callable, tested path. `registerResources` is the
 * seam a live MCP transport binds; until the SDK transport is wired it binds a
 * default-workspace reader.
 */

import { resWorkspaceCurrent, URI_WORKSPACE } from "./resources/workspace.js";
import { resSync, URI_SYNC } from "./resources/sync.js";
import { resGraph, URI_GRAPH } from "./resources/graph.js";
import { resDecisions, URI_DECISIONS } from "./resources/decisions.js";
import { resRuns, URI_RUNS } from "./resources/runs.js";
import type { ResourceDefinition, ResourceHandler } from "./resources/types.js";

export const resourceHandlers: Record<string, ResourceHandler> = {
  [URI_WORKSPACE]: resWorkspaceCurrent,
  [URI_SYNC]: resSync,
  [URI_GRAPH]: resGraph,
  [URI_DECISIONS]: resDecisions,
  [URI_RUNS]: resRuns,
};

export const resourceDefinitions: ResourceDefinition[] = [
  { uri: URI_WORKSPACE, name: "workspace", description: "Current repository, workspace path, connectors, engine version." },
  { uri: URI_SYNC, name: "sync", description: "Sync metadata for every connector bound to the workspace." },
  { uri: URI_GRAPH, name: "graph", description: "Graph node/edge counts + statistics (metadata only)." },
  { uri: URI_DECISIONS, name: "decisions", description: "Decision count, latest decisions, confidence distribution." },
  { uri: URI_RUNS, name: "runs", description: "Recent workflow runs: id, workflow, status, timestamp." },
];

