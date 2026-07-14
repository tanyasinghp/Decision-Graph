/**
 * Progress — translate the platform's WorkflowEvent stream into MCP-style
 * notifications. Like the CLI's ProgressReporter, this is only a sink: it never
 * polls and never duplicates a line; the EventBus pushes.
 *
 * Phase 3.1 keeps this transport-agnostic. `ProgressEmitter` is the seam the
 * MCP SDK's notification senders (`notifications/progress`,
 * `notifications/message`) will implement in Phase 3.2 — this file already
 * maps every WorkflowEvent onto it, so no tool code needs to.
 */

import type { EventSink, WorkflowEvent } from "@dg/core";

/** Minimal notification surface; the SDK's sendNotification satisfies this in 3.2. */
export interface ProgressEmitter {
  /** Determinate progress (connector page counts, etc.). */
  progress(update: { progress: number; total?: number; message?: string }): void;
  /** Log / trace line (lifecycle markers, nested engine RunEvents). */
  log(entry: { level: "info" | "warning" | "error"; data: unknown }): void;
}

/** A no-op emitter (placeholder bindings / progress-less contexts). */
export const silentEmitter: ProgressEmitter = {
  progress() {},
  log() {},
};

export function createProgressSink(emitter: ProgressEmitter): EventSink {
  return (e: WorkflowEvent) => {
    const p = e.payload;
    if (p.kind === "connector") {
      const c = p.progress;
      emitter.progress({
        progress: c.current ?? e.seq,
        ...(c.total !== undefined ? { total: c.total } : {}),
        message: c.message,
      });
    } else if (p.kind === "lifecycle") {
      const l = p.lifecycle;
      const level =
        l.kind === "run_failed" ? "error" : l.kind === "run_cancelled" ? "warning" : "info";
      emitter.log({ level, data: l });
    } else if (p.kind === "run_event") {
      emitter.log({ level: "info", data: p.event });
    }
  };
}
