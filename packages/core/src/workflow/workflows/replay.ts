/**
 * replay workflow — re-emit a recorded run's events with NO model call.
 * Resolves the run log through the Workspace (Stores.runLog()) rather than
 * touching RunLog directly; each RunEvent is nested back into the live stream.
 */

import type { RunEvent } from "@dg/domain/types.js";
import type { Step } from "../Step.js";
import type { Workflow } from "../Workflow.js";

export interface ReplayInput {
  /** Id of the previously recorded run to replay. */
  runId: string;
}
export interface ReplayOutput {
  events: number;
}

const replayStep: Step<string, ReplayOutput> = {
  id: "replay.stream",
  title: "Replay recorded run",
  idempotent: false,
  async run(sourceRunId, ctx) {
    const events: RunEvent[] = ctx.workspace.stores().runLog().read(sourceRunId);
    let emitted = 0;
    for (const e of events) {
      if (ctx.signal.aborted) break;
      ctx.runEvent(e);
      emitted++;
    }
    return { events: emitted };
  },
};

export const replayWorkflow: Workflow<ReplayInput, ReplayOutput> = {
  name: "replay",
  steps: [replayStep],
  async execute(input, ctx) {
    return ctx.runStep(replayStep, input.runId);
  },
};
