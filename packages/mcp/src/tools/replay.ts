import { resolveWorkspace } from "../context.js";
import { createProgressSink } from "../progress.js";
import { isFailure, toToolError } from "../errors.js";
import type { ToolHandler } from "./types.js";

export interface ReplayArgs {
  workspace: string;
  runId: string;
}

export const dgReplay: ToolHandler<ReplayArgs> = async ({ ctx, args, signal, emitter }) => {
  const ws = await resolveWorkspace(ctx, args.workspace);
  const sink = createProgressSink(emitter);
  const r = await ctx.engine.replay({
    workspace: ws,
    recordedRunId: args.runId,
    sinks: [sink],
    signal,
  });
  if (isFailure(r.status)) return toToolError("dg_replay", r);
  return { isError: false, structured: r };
};
