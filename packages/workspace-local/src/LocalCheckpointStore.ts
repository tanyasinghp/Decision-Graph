/**
 * LocalCheckpointStore — file-backed checkpoints + step outputs.
 *
 *   <checkpointsDir>/<runId>.checkpoint.json     — the Checkpoint
 *   <checkpointsDir>/<runId>/<step>.output.json  — persisted step outputs
 *
 * This is the resume substrate: a completed idempotent step's output is read
 * back from here instead of being recomputed.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Checkpoint } from "@dg/core";

const safe = (s: string): string => s.replace(/[^a-zA-Z0-9._-]/g, "_");

export class LocalCheckpointStore {
  constructor(private readonly dir: string) {}

  private ckptFile(runId: string): string {
    return path.join(this.dir, `${safe(runId)}.checkpoint.json`);
  }
  private outputFile(runId: string, stepId: string): string {
    return path.join(this.dir, safe(runId), `${safe(stepId)}.output.json`);
  }

  putCheckpoint(c: Checkpoint): void {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.ckptFile(c.runId), JSON.stringify(c, null, 2) + "\n", "utf8");
  }

  getCheckpoint(runId: string): Checkpoint | undefined {
    const f = this.ckptFile(runId);
    return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf8")) as Checkpoint) : undefined;
  }

  putStepOutput(runId: string, stepId: string, output: unknown): string {
    const f = this.outputFile(runId, stepId);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(output ?? null, null, 2) + "\n", "utf8");
    return `${runId}::${stepId}`;
  }

  getStepOutput(runId: string, ref: string): unknown {
    const stepId = ref.startsWith(`${runId}::`) ? ref.slice(runId.length + 2) : ref;
    const f = this.outputFile(runId, stepId);
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : undefined;
  }
}
