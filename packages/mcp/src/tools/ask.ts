/**
 * dg_ask — resolve workspace → attach progress sink → engine.ask() →
 * return the AskResult unchanged (mapping non-completed status via toToolError
 * once).
 */

import { resolveWorkspace } from "../context.js";
import { createProgressSink } from "../progress.js";
import { isFailure, toToolError } from "../errors.js";
import type { ToolHandler } from "./types.js";

export interface AskArgs {
  workspace: string;
  question: string;
}

export const dgAsk: ToolHandler<AskArgs> = async ({ ctx, args, signal, emitter }) => {
  const ws = await resolveWorkspace(ctx, args.workspace);
  const sink = createProgressSink(emitter);

  const r = await ctx.engine.ask({
    workspace: ws,
    question: args.question,
    sinks: [sink],
    signal,
  });

  if (isFailure(r.status)) return toToolError("dg_ask", r);
  return { isError: false, structured: r };
};
