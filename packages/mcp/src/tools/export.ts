import type { ExportFormat } from "@dg/core";
import { resolveWorkspace } from "../context.js";
import { createProgressSink } from "../progress.js";
import { isFailure, toToolError } from "../errors.js";
import type { ToolHandler } from "./types.js";

export interface ExportArgs {
  workspace: string;
  format: ExportFormat;
}

export const dgExport: ToolHandler<ExportArgs> = async ({ ctx, args, signal, emitter }) => {
  const ws = await resolveWorkspace(ctx, args.workspace);
  const sink = createProgressSink(emitter);
  const r = await ctx.engine.export({
    workspace: ws,
    format: args.format,
    sinks: [sink],
    signal,
  });
  if (isFailure(r.status)) return toToolError("dg_export", r);
  return { isError: false, structured: r };
};
