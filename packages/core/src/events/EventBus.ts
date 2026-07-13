/**
 * EventBus — one ordered stream per run, many sinks.
 *
 * The Core publishes; every surface (TTY renderer, JSON lines, SSE, MCP
 * progress, the persistence sink) is just a subscriber. `seq` is assigned here
 * so ordering is authoritative regardless of sink behaviour.
 */

import type {
  EventLevel,
  EventSink,
  Unsubscribe,
  WorkflowEvent,
  WorkflowEventPayload,
  WorkflowLifecycle,
} from "./WorkflowEvent.js";
import type { RunEvent } from "@dg/domain/types.js";

export class EventBus {
  private seq: number;
  private last = -1;
  private readonly sinks = new Set<EventSink>();

  constructor(
    readonly runId: string,
    readonly workflow: string,
    private readonly clock: () => string = () => new Date().toISOString(),
    startSeq = 0
  ) {
    this.seq = startSeq;
  }

  subscribe(sink: EventSink): Unsubscribe {
    this.sinks.add(sink);
    return () => {
      this.sinks.delete(sink);
    };
  }

  publish(level: EventLevel, payload: WorkflowEventPayload, step?: string): WorkflowEvent {
    const e: WorkflowEvent = {
      runId: this.runId,
      workflow: this.workflow,
      step,
      seq: this.seq++,
      ts: this.clock(),
      level,
      payload,
    };
    this.last = e.seq;
    for (const sink of this.sinks) sink(e);
    return e;
  }

  /** Emit a Core lifecycle marker. */
  lifecycle(ev: WorkflowLifecycle, step?: string): WorkflowEvent {
    return this.publish("lifecycle", { kind: "lifecycle", lifecycle: ev }, step);
  }

  /** Nest a Phase 1 RunEvent; severity is derived so renderers can style it. */
  runEvent(event: RunEvent, step?: string): WorkflowEvent {
    const level: EventLevel =
      event.t === "decision_rejected" || (event.t === "tool_result" && event.isError)
        ? "warn"
        : event.t === "run_finished" || event.t === "phase"
          ? "lifecycle"
          : "trace";
    return this.publish(level, { kind: "run_event", event }, step);
  }

  get lastSeq(): number {
    return this.last;
  }
}

// Re-export so consumers of the bus don't need a second import for the nested type.
export type { RunEvent };
