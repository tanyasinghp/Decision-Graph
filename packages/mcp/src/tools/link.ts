import { resolveWorkspace } from "../context.js";
import { createProgressSink } from "../progress.js";
import { isFailure, toToolError } from "../errors.js";
import type { ToolHandler } from "./types.js";

export interface LinkArgs {
  workspace: string;
}

export const dgLink: ToolHandler<LinkArgs> = async ({ ctx, args, signal, emitter }) => {
  const ws = await resolveWorkspace(ctx, args.workspace);
  const sink = createProgressSink(emitter);
  const r = await ctx.engine.link({
    workspace: ws,
    sinks: [sink],
    signal,
  });
  if (isFailure(r.status)) return toToolError("dg_link", r);
  return { isError: false, structured: r };
};
