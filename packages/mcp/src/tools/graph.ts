import { resolveWorkspace } from "../context.js";
import { createProgressSink } from "../progress.js";
import { isFailure, toToolError } from "../errors.js";
import type { ToolHandler } from "./types.js";

export interface GraphArgs {
  workspace: string;
  link?: boolean;
}

export const dgGraph: ToolHandler<GraphArgs> = async ({ ctx, args, signal, emitter }) => {
  const ws = await resolveWorkspace(ctx, args.workspace);
  const sink = createProgressSink(emitter);
  const r = await ctx.engine.buildGraph({
    workspace: ws,
    ...(args.link !== undefined ? { link: args.link } : {}),
    sinks: [sink],
    signal,
  });
  if (isFailure(r.status)) return toToolError("dg_graph", r);
  return { isError: false, structured: r };
};
