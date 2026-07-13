/**
 * WorkflowEngine — the harness that runs a Workflow.
 *
 * It owns the cross-cutting concerns the six Phase 1 scripts each hand-rolled:
 * a monotonic event stream, checkpoint recording, resume-skip of completed
 * idempotent steps, and cooperative cancellation at step boundaries. It holds
 * NO reasoning logic — it only sequences steps that wrap engine services.
 *
 * Failures resolve (not reject) into a typed WorkflowResult: `completed`,
 * `truncated` (cancelled — resumable) or `failed`.
 */

import { EventBus } from "../events/EventBus.js";
import type { EventSink } from "../events/WorkflowEvent.js";
import type { RunStore } from "../checkpoint/RunStore.js";
import type { Checkpoint, ResumePolicy, StepOutcome } from "../checkpoint/Checkpoint.js";
import type { Workspace } from "../workspace/Workspace.js";
import { silentLogger, type Logger } from "../util/logger.js";
import { genRunId, hashOf } from "../util/hash.js";
import type { Step, StepContext } from "./Step.js";
import type { Workflow, WorkflowContext, WorkflowResult } from "./Workflow.js";

export interface RunOptions {
  workspace: Workspace;
  /** Extra subscribers (renderers, SSE, MCP progress). The journal sink is added automatically. */
  sinks?: EventSink[];
  runStore?: RunStore;
  resume?: ResumePolicy;
  signal?: AbortSignal;
  /** Force a specific run id (e.g. to resume). Ignored when resume.mode==="resume". */
  runId?: string;
  clock?: () => string;
  logger?: Logger;
}

export interface WorkflowRunHandle<O> {
  readonly runId: string;
  readonly result: Promise<WorkflowResult<O>>;
  cancel(): void;
}

/** Internal sentinel: a step was skipped because cancellation was requested. */
class Cancelled extends Error {
  constructor() {
    super("workflow cancelled");
    this.name = "Cancelled";
  }
}

export class WorkflowEngine {
  run<I, O>(wf: Workflow<I, O>, input: I, opts: RunOptions): WorkflowRunHandle<O> {
    const clock = opts.clock ?? (() => new Date().toISOString());
    const logger: Logger = opts.logger ?? silentLogger;
    // The workspace is the sole resolver of concrete stores; the run store is
    // one of them. A caller may still override (e.g. tests, in-memory runs).
    const runStore: RunStore = opts.runStore ?? opts.workspace.runStore();
    const resume: ResumePolicy = opts.resume ?? { mode: "fresh" };
    const runId = resume.mode === "resume" ? resume.runId : opts.runId ?? genRunId(wf.name);
    const inputHash = hashOf(input);

    // Load a prior checkpoint only when resuming and the input matches.
    const prior = resume.mode !== "fresh" ? runStore.getCheckpoint(runId) : undefined;
    const cp: Checkpoint =
      prior && prior.inputHash === inputHash
        ? { ...prior, completedSteps: { ...prior.completedSteps }, status: "running" }
        : {
            runId,
            workflow: wf.name,
            inputHash,
            completedSteps: {},
            lastSeq: -1,
            status: "running",
            updatedAt: clock(),
          };

    const bus = new EventBus(runId, wf.name, clock, cp.lastSeq + 1);
    bus.subscribe((e) => {
      runStore.appendEvent(e);
      cp.lastSeq = e.seq;
    });
    for (const sink of opts.sinks ?? []) bus.subscribe(sink);

    // Cancellation: our own controller, optionally chained to a caller signal.
    const controller = new AbortController();
    if (opts.signal) {
      if (opts.signal.aborted) controller.abort();
      else opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    const signal = controller.signal;

    const persist = (): void => {
      cp.updatedAt = clock();
      runStore.putCheckpoint(cp);
    };

    const runStep = async <SI, SO>(step: Step<SI, SO>, sInput: SI): Promise<SO> => {
      if (signal.aborted) throw new Cancelled();

      const done = cp.completedSteps[step.id];
      if (done && step.idempotent && resume.mode !== "fresh") {
        bus.lifecycle({ kind: "step_skipped", step: step.id, reason: "checkpoint" }, step.id);
        return runStore.getStepOutput(runId, done.outputRef) as SO;
      }

      bus.lifecycle({ kind: "step_started", step: step.id, title: step.title }, step.id);
      const t0 = Date.now();

      const stepCtx: StepContext = {
        workspace: opts.workspace,
        signal,
        logger,
        checkpoint: { note: () => {} },
        emit: (payload, level = "trace") => {
          bus.publish(level, payload, step.id);
        },
        runEvent: (e) => {
          bus.runEvent(e, step.id);
        },
      };

      let out: SO;
      try {
        out = await step.run(sInput, stepCtx);
      } catch (err) {
        bus.lifecycle({ kind: "step_finished", step: step.id, ok: false, ms: Date.now() - t0 }, step.id);
        throw err;
      }
      bus.lifecycle({ kind: "step_finished", step: step.id, ok: true, ms: Date.now() - t0 }, step.id);

      if (step.idempotent) {
        const outputRef = runStore.putStepOutput(runId, step.id, out);
        const outcome: StepOutcome = { stepId: step.id, outputRef, hash: hashOf(out), ts: clock() };
        cp.completedSteps[step.id] = outcome;
        persist();
      }
      return out;
    };

    const wfCtx: WorkflowContext = {
      workspace: opts.workspace,
      signal,
      logger,
      emit: (payload, level = "trace") => {
        bus.publish(level, payload);
      },
      runStep,
    };

    const start = Date.now();
    const result: Promise<WorkflowResult<O>> = (async () => {
      bus.lifecycle({ kind: "run_started", input });
      try {
        const output = await wf.execute(input, wfCtx);
        cp.status = "completed";
        persist();
        bus.lifecycle({ kind: "run_finished", status: "completed", ms: Date.now() - start });
        return { runId, status: "completed", output, events: bus.lastSeq + 1 };
      } catch (err) {
        if (signal.aborted || err instanceof Cancelled) {
          cp.status = "truncated";
          persist();
          bus.lifecycle({ kind: "run_cancelled" });
          bus.lifecycle({ kind: "run_finished", status: "truncated", ms: Date.now() - start });
          return { runId, status: "truncated", events: bus.lastSeq + 1 };
        }
        const message = err instanceof Error ? err.message : String(err);
        cp.status = "failed";
        persist();
        bus.lifecycle({ kind: "run_failed", message });
        bus.lifecycle({ kind: "run_finished", status: "failed", ms: Date.now() - start });
        return { runId, status: "failed", error: { message }, events: bus.lastSeq + 1 };
      }
    })();

    return { runId, result, cancel: () => controller.abort() };
  }
}
