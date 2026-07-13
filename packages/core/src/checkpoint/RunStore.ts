/**
 * RunStore — the run journal + checkpoint + step-output persistence port.
 *
 * The file-backed implementation (wrapping the engine's append-only RunLog)
 * ships with the local Workspace adapter in Phase 2.4. `InMemoryRunStore` here
 * is enough to exercise cancellation/resume within a process and is the default
 * when a caller doesn't supply one.
 */

import type { WorkflowEvent } from "../events/WorkflowEvent.js";
import type { Checkpoint } from "./Checkpoint.js";

export interface RunStore {
  appendEvent(e: WorkflowEvent): void;
  readEvents(runId: string): WorkflowEvent[];
  putCheckpoint(c: Checkpoint): void;
  getCheckpoint(runId: string): Checkpoint | undefined;
  /** Persist a step's output; returns a ref used later to skip on resume. */
  putStepOutput(runId: string, stepId: string, output: unknown): string;
  getStepOutput(runId: string, ref: string): unknown;
}

export class InMemoryRunStore implements RunStore {
  private readonly events = new Map<string, WorkflowEvent[]>();
  private readonly checkpoints = new Map<string, Checkpoint>();
  private readonly outputs = new Map<string, unknown>();

  appendEvent(e: WorkflowEvent): void {
    const list = this.events.get(e.runId) ?? [];
    list.push(e);
    this.events.set(e.runId, list);
  }

  readEvents(runId: string): WorkflowEvent[] {
    return this.events.get(runId) ?? [];
  }

  putCheckpoint(c: Checkpoint): void {
    // store a copy so later mutation of the live checkpoint doesn't leak in
    this.checkpoints.set(c.runId, { ...c, completedSteps: { ...c.completedSteps } });
  }

  getCheckpoint(runId: string): Checkpoint | undefined {
    return this.checkpoints.get(runId);
  }

  putStepOutput(runId: string, stepId: string, output: unknown): string {
    const ref = `${runId}::${stepId}`;
    this.outputs.set(ref, output);
    return ref;
  }

  getStepOutput(_runId: string, ref: string): unknown {
    return this.outputs.get(ref);
  }
}
