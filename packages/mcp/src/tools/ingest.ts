/**
 * dg_ingest — resolve workspace → attach progress sink → engine.ingest() →
 * return the WorkflowResult (mapping non-completed status via toToolError once).
 */

import type { SourceSystem, SyncScope } from "@dg/core";
import { resolveWorkspace } from "../context.js";
import { createProgressSink } from "../progress.js";
import { isFailure, toToolError } from "../errors.js";
import type { ToolHandler } from "./types.js";

export interface IngestArgs {
  workspace: string;
  source?: SourceSystem;
  scope?: Partial<SyncScope>;
}

export const dgIngest: ToolHandler<IngestArgs> = async ({ ctx, args, signal, emitter }) => {
  const ws = await resolveWorkspace(ctx, args.workspace);
  const sink = createProgressSink(emitter);

  const r = await ctx.engine.ingest({
    workspace: ws,
    source: args.source ?? "github",
    ...(args.scope ? { scope: args.scope } : {}),
    sinks: [sink],
    signal,
  });

  if (isFailure(r.status)) return toToolError("dg_ingest", r);
  return { isError: false, structured: r };
};
