/**
 * The Phase 2 event envelope.
 *
 * Every observable moment across every surface is a WorkflowEvent. It *nests*
 * the Phase 1 `RunEvent` unchanged (so the existing trace panel and replay keep
 * working byte-for-byte) and adds workflow/step framing plus a monotonic `seq`
 * that gives ordering and doubles as the resume cursor.
 */

import type { RunEvent } from "@dg/domain/types.js";

export type WorkflowStatus = "running" | "completed" | "truncated" | "failed";

export type EventLevel = "lifecycle" | "progress" | "trace" | "warn" | "error";

/** Workflow/step lifecycle markers owned by the Core. */
export type WorkflowLifecycle =
  | { kind: "run_started"; input: unknown }
  | { kind: "step_started"; step: string; title: string }
  | { kind: "step_skipped"; step: string; reason: "checkpoint" }
  | { kind: "step_finished"; step: string; ok: boolean; ms: number }
  | { kind: "run_cancelled"; atStep?: string }
  | { kind: "run_failed"; step?: string; message: string }
  | { kind: "run_finished"; status: WorkflowStatus; ms: number };

/** Determinate connector progress (used by the future ingest workflow). */
export interface ConnectorProgress {
  source: string;
  message: string;
  current?: number;
  total?: number;
}

export type WorkflowEventPayload =
  | { kind: "lifecycle"; lifecycle: WorkflowLifecycle }
  | { kind: "run_event"; event: RunEvent }
  | { kind: "connector"; progress: ConnectorProgress };

export interface WorkflowEvent {
  runId: string;
  workflow: string;
  step?: string;
  /** Monotonic per run: ordering guarantee + resume cursor. */
  seq: number;
  ts: string;
  level: EventLevel;
  payload: WorkflowEventPayload;
}

export type EventSink = (e: WorkflowEvent) => void;
export type Unsubscribe = () => void;
