import { resolveWorkspace } from "../context.js";
import { createProgressSink } from "../progress.js";
import { isFailure, toToolError } from "../errors.js";
import type { ToolHandler } from "./types.js";

export interface CounterfactualArgs {
  workspace: string;
  question: string;
}

export const dgCounterfactual: ToolHandler<CounterfactualArgs> = async ({ ctx, args, signal, emitter }) => {
  const ws = await resolveWorkspace(ctx, args.workspace);
  const sink = createProgressSink(emitter);
  const r = await ctx.engine.counterfactual({
    workspace: ws,
    question: args.question,
    sinks: [sink],
    signal,
  });
  if (isFailure(r.status)) return toToolError("dg_counterfactual", r);
  return { isError: false, structured: r };
};
