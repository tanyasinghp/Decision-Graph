/**
 * Step — a typed unit of orchestration that wraps exactly one existing service
 * call. Steps contain NO reasoning logic; that lives in the wrapped engine
 * service. The engine harness (WorkflowEngine) adds events, checkpointing,
 * resume-skip and cancellation around every step uniformly.
 */

import type { RunEvent } from "@dg/domain/types.js";
import type { EventLevel, WorkflowEventPayload } from "../events/WorkflowEvent.js";
import type { CheckpointWriter } from "../checkpoint/Checkpoint.js";
import type { Workspace } from "../workspace/Workspace.js";
import type { Logger } from "../util/logger.js";

export interface StepContext {
  readonly workspace: Workspace;
  readonly signal: AbortSignal;
  readonly checkpoint: CheckpointWriter;
  readonly logger: Logger;
  /** Emit a workflow-level event (scoped to this step). */
  emit(payload: WorkflowEventPayload, level?: EventLevel): void;
  /** Nest a Phase 1 RunEvent produced by the wrapped service. */
  runEvent(e: RunEvent): void;
}

export interface Step<I, O> {
  /** Stable id; used as the checkpoint key — must be unique within a run. */
  readonly id: string;
  readonly title: string;
  /** May we skip this step on resume when its output is already recorded? */
  readonly idempotent: boolean;
  run(input: I, ctx: StepContext): Promise<O>;
}
