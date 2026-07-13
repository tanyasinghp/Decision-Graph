/**
 * @dg/core — the application layer that orchestrates the Phase 1 engine.
 *
 * Public surface for every driving adapter (CLI, MCP, REST, …). Nothing here
 * performs reasoning; it sequences existing services with uniform events,
 * checkpoints, resume and cancellation.
 */

// Events
export type {
  WorkflowEvent,
  WorkflowEventPayload,
  WorkflowLifecycle,
  WorkflowStatus,
  EventLevel,
  EventSink,
  Unsubscribe,
  ConnectorProgress,
} from "./events/WorkflowEvent.js";
export { EventBus } from "./events/EventBus.js";

// Checkpoint / run store
export type { Checkpoint, StepOutcome, ResumePolicy, CheckpointWriter } from "./checkpoint/Checkpoint.js";
export { InMemoryRunStore } from "./checkpoint/RunStore.js";
export type { RunStore } from "./checkpoint/RunStore.js";

// Workspace port
export type {
  Workspace,
  WorkspaceRef,
  WorkspaceConfig,
  WorkspaceProvider,
  Stores,
  DecisionStore,
  RunLogReader,
} from "./workspace/Workspace.js";

// Sync store
export type { SyncStore, SyncMetadata, SyncStatus } from "./sync/SyncStore.js";

// Connector framework (ports + registry)
export * from "./connector/index.js";

// Workflow model + engine
export type { Step, StepContext } from "./workflow/Step.js";
export type { Workflow, WorkflowContext, WorkflowResult } from "./workflow/Workflow.js";
export { WorkflowEngine } from "./workflow/WorkflowEngine.js";
export type { RunOptions, WorkflowRunHandle } from "./workflow/WorkflowEngine.js";
export { WorkflowCatalog } from "./workflow/WorkflowCatalog.js";

// Built-in workflows
export * from "./workflow/workflows/index.js";

// Utilities
export type { Logger } from "./util/logger.js";
export { silentLogger } from "./util/logger.js";
export { hashOf, stableStringify, genRunId } from "./util/hash.js";

// Facade
export { DecisionGraphEngine } from "./DecisionGraphEngine.js";
export type {
  DecisionGraphEngineOptions,
  EngineCallOptions,
  AskResult,
  AnalyzeResult,
  AnalyzeSummary,
} from "./DecisionGraphEngine.js";
