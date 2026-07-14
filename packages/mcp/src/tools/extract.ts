import { resolveWorkspace } from "../context.js";
import { createProgressSink } from "../progress.js";
import { isFailure, toToolError } from "../errors.js";
import type { ToolHandler } from "./types.js";

export interface ExtractArgs {
  workspace: string;
  components: string[];
}

export const dgExtract: ToolHandler<ExtractArgs> = async ({ ctx, args, signal, emitter }) => {
  const ws = await resolveWorkspace(ctx, args.workspace);
  const sink = createProgressSink(emitter);
  const r = await ctx.engine.extract({
    workspace: ws,
    components: args.components,
    sinks: [sink],
    signal,
  });
  if (isFailure(r.status)) return toToolError("dg_extract", r);
  return { isError: false, structured: r };
};
