import { resolveWorkspace } from "../context.js";
import { createProgressSink } from "../progress.js";
import { isFailure, toToolError } from "../errors.js";
import type { ToolHandler } from "./types.js";

export interface EvaluateArgs {
  workspace: string;
  component: string;
}

export const dgEvaluate: ToolHandler<EvaluateArgs> = async ({ ctx, args, signal, emitter }) => {
  const ws = await resolveWorkspace(ctx, args.workspace);
  const sink = createProgressSink(emitter);
  const r = await ctx.engine.evaluate({
    workspace: ws,
    component: args.component,
    sinks: [sink],
    signal,
  });
  if (isFailure(r.status)) return toToolError("dg_evaluate", r);
  return { isError: false, structured: r };
};
