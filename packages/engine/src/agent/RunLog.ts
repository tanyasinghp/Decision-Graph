/**
 * agent/RunLog.ts — append-only JSONL event log; the replay substrate.
 *
 * ARCHITECTURAL DECISION: the run log is the ONLY channel through which the
 * outside world observes a run. The CLI progress printer, the future SSE
 * endpoint, and the future UI trace panel are all just RunEvent consumers.
 * Because every observable step flows through here, replaying the file IS
 * replaying the run — no Claude call needed, byte-for-byte identical trace.
 *
 * Events are validated against RunEventSchema on write. A malformed event is
 * a programming error and throws immediately — a replay log you can't trust
 * is worse than no log.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { RunEventSchema } from "@dg/domain/schemas.js";
import type { RunEvent } from "@dg/domain/types.js";

export type EventSink = (event: RunEvent) => void;

export class RunLog {
  private readonly filePath: string;
  private readonly extraSinks: EventSink[] = [];

  constructor(runsDir: string, readonly runId: string) {
    fs.mkdirSync(runsDir, { recursive: true });
    this.filePath = path.join(runsDir, `${runId}.jsonl`);
  }

  /** Attach a live consumer (console printer now; SSE later). */
  pipe(sink: EventSink): void {
    this.extraSinks.push(sink);
  }

  emit(event: RunEvent): void {
    RunEventSchema.parse(event); // fail fast on malformed events
    fs.appendFileSync(this.filePath, JSON.stringify(event) + "\n", "utf8");
    for (const sink of this.extraSinks) sink(event);
  }

  /** Replay a previously recorded run without invoking any model. */
  static read(runsDir: string, runId: string): RunEvent[] {
    const file = path.join(runsDir, `${runId}.jsonl`);
    return fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => RunEventSchema.parse(JSON.parse(l)));
  }
}

export const now = (): string => new Date().toISOString();
