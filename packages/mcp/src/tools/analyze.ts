/**
 * dg_analyze — resolve workspace → attach progress sink → engine.analyze() →
 * return the AnalyzeResult unchanged (mapping non-completed status via
 * toToolError once).
 */

import type { SourceSystem, SyncScope } from "@dg/core";
import { resolveWorkspace } from "../context.js";
import { createProgressSink } from "../progress.js";
import { isFailure, toToolError } from "../errors.js";
import type { ToolHandler } from "./types.js";

export interface AnalyzeArgs {
  workspace: string;
  components: string[];
  source?: SourceSystem;
  link?: boolean;
  scope?: Partial<SyncScope>;
}

export const dgAnalyze: ToolHandler<AnalyzeArgs> = async ({ ctx, args, signal, emitter }) => {
  const ws = await resolveWorkspace(ctx, args.workspace);
  const sink = createProgressSink(emitter);

  const r = await ctx.engine.analyze({
    workspace: ws,
    components: args.components,
    source: args.source ?? "github",
    ...(args.link !== undefined ? { link: args.link } : {}),
    ...(args.scope ? { scope: args.scope } : {}),
    sinks: [sink],
    signal,
  });

  if (isFailure(r.status)) return toToolError("dg_analyze", r);
  return { isError: false, structured: r };
};
