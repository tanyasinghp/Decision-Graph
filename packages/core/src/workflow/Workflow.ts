/**
 * Workflow — a named orchestration over existing services.
 *
 * `steps` is declared for introspection (catalog display, docs); `execute`
 * composes them via `ctx.runStep`, which routes each step through the engine
 * harness so events, checkpoints, resume and cancellation are uniform. The
 * workflow body itself contains only orchestration — never reasoning.
 */

import type { Workspace } from "../workspace/Workspace.js";
import type { Logger } from "../util/logger.js";
import type { EventLevel, WorkflowEventPayload, WorkflowStatus } from "../events/WorkflowEvent.js";
import type { Step } from "./Step.js";

export interface WorkflowContext {
  readonly workspace: Workspace;
  readonly signal: AbortSignal;
  readonly logger: Logger;
  emit(payload: WorkflowEventPayload, level?: EventLevel): void;
  /** Run a declared Step through the harness and get its typed output. */
  runStep<I, O>(step: Step<I, O>, input: I): Promise<O>;
}

export interface Workflow<Input, Output> {
  readonly name: string;
  // Heterogeneous step list (each step has its own I/O); `any` is the pragmatic
  // choice for a mixed-arity array declared purely for introspection.
  readonly steps: ReadonlyArray<Step<any, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
  execute(input: Input, ctx: WorkflowContext): Promise<Output>;
}

export interface WorkflowResult<O> {
  runId: string;
  status: Exclude<WorkflowStatus, "running">;
  output?: O;
  error?: { message: string; step?: string };
  /** Total events emitted (journal length). */
  events: number;
}
