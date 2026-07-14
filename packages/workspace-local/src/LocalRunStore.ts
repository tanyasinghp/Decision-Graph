/**
 * LocalRunStore — file-backed workflow journal + checkpoint store.
 *
 * The workflow-level event journal is an append-only JSONL file per run
 * (<runsDir>/<runId>.events.jsonl) — the same pattern as the engine's RunLog,
 * generalized to WorkflowEvents. Checkpoints and step outputs delegate to
 * LocalCheckpointStore. Together they satisfy the core RunStore port.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Checkpoint, RunStore, WorkflowEvent } from "@dg/core";
import { LocalCheckpointStore } from "./LocalCheckpointStore.js";

const safe = (s: string): string => s.replace(/[^a-zA-Z0-9._-]/g, "_");

export class LocalRunStore implements RunStore {
  private readonly checkpoints: LocalCheckpointStore;

  constructor(
    private readonly eventsDir: string,
    checkpointsDir: string = path.join(eventsDir, "checkpoints")
  ) {
    this.checkpoints = new LocalCheckpointStore(checkpointsDir);
  }

  private eventsFile(runId: string): string {
    return path.join(this.eventsDir, `${safe(runId)}.events.jsonl`);
  }

  appendEvent(e: WorkflowEvent): void {
    fs.mkdirSync(this.eventsDir, { recursive: true });
    fs.appendFileSync(this.eventsFile(e.runId), JSON.stringify(e) + "\n", "utf8");
  }

  readEvents(runId: string): WorkflowEvent[] {
    const f = this.eventsFile(runId);
    if (!fs.existsSync(f)) return [];
    return fs
      .readFileSync(f, "utf8")
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .flatMap((l) => {
        try { return [JSON.parse(l) as WorkflowEvent]; } catch { return []; }
      });
  }

  putCheckpoint(c: Checkpoint): void {
    this.checkpoints.putCheckpoint(c);
  }
  getCheckpoint(runId: string): Checkpoint | undefined {
    return this.checkpoints.getCheckpoint(runId);
  }
  list(): Checkpoint[] {
    return this.checkpoints.list();
  }
  putStepOutput(runId: string, stepId: string, output: unknown): string {
    return this.checkpoints.putStepOutput(runId, stepId, output);
  }
  getStepOutput(runId: string, ref: string): unknown {
    return this.checkpoints.getStepOutput(runId, ref);
  }
}
