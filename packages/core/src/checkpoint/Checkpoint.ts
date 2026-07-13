/**
 * Checkpoint model.
 *
 * Resumability is layered: the engine's stores are already content-addressed
 * and idempotent (re-running a step is safe), and the event journal is ordered.
 * The Checkpoint is the thin top layer that records which Steps completed and
 * where their outputs landed, so resume can *skip* completed idempotent Steps
 * instead of redoing them.
 */

import type { WorkflowStatus } from "../events/WorkflowEvent.js";

export interface StepOutcome {
  stepId: string;
  /** Opaque handle into the RunStore for the step's persisted output. */
  outputRef: string;
  /** Content fingerprint of the output (audit / drift detection). */
  hash: string;
  ts: string;
}

export interface Checkpoint {
  runId: string;
  workflow: string;
  /** Hash of the run input — a resume must target the same input. */
  inputHash: string;
  completedSteps: Record<string, StepOutcome>;
  /** Last event seq written — the resume cursor into the journal. */
  lastSeq: number;
  status: WorkflowStatus;
  updatedAt: string;
}

export type ResumePolicy =
  | { mode: "fresh" }
  | { mode: "resume"; runId: string }
  | { mode: "auto" };

/** Passed into a Step so it can annotate the checkpoint (metadata only). */
export interface CheckpointWriter {
  note(key: string, value: unknown): void;
}
