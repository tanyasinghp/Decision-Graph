import type { SourceSystem } from "@dg/domain/graph.js";
import type { SyncResult, SyncScope } from "../../connector/types.js";
import type { SyncMetadata, SyncStatus } from "../../sync/SyncStore.js";
import type { Step } from "../Step.js";
import type { Workflow } from "../Workflow.js";

export interface IngestInput {
  source: SourceSystem;
  scope?: Partial<SyncScope>;
}
export type IngestOutput = SyncResult;

const syncStep: Step<IngestInput, SyncResult> = {
  id: "ingest.sync",
  title: "Synchronize source into workspace",
  idempotent: false,
  async run(input, ctx) {
    const ws = ctx.workspace;
    const binding = ws.connectors().find((b) => b.source === input.source);
    if (!binding) throw new Error(`Source "${input.source}" is not bound to workspace ${ws.ref}`);

    const connector = ws.connector(input.source);
    const session = await connector.authenticate(binding.config);
    const store = ws.stores().evidenceWrite(input.source);

    const scope: SyncScope = {
      repo: ws.config.repo,
      ...(binding.config.scope as Partial<SyncScope> | undefined),
      ...input.scope,
    };

    const startedAt = new Date().toISOString();
    const startMs = Date.now();
    let syncError: Error | undefined;
    let result: SyncResult;

    try {
      result = await connector.sync(session, scope, store, {
        signal: ctx.signal,
        progress: (p) => ctx.emit({ kind: "connector", progress: p }, "progress"),
        runEvent: (e) => ctx.runEvent(e),
      }, binding.cursor);
    } catch (err) {
      syncError = err instanceof Error ? err : new Error(String(err));
      result = {
        source: input.source,
        counts: {},
        cursor: { since: undefined },
        artifacts: 0,
        complete: false,
      };
    }

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startMs;

    let status: SyncStatus;
    if (syncError) {
      status = "failed";
    } else if (ctx.signal.aborted) {
      status = "cancelled";
    } else if (result.complete) {
      status = "completed";
    } else {
      status = "failed";
    }

    if (result.complete && !syncError) ws.saveCursor(input.source, result.cursor);

    ws.stores().sync().write({
      schemaVersion: 1,
      source: input.source,
      repo: ws.config.repo,
      status,
      startedAt,
      completedAt,
      durationMs,
      artifacts: result.artifacts,
      counts: result.counts,
      cursor: result.complete ? result.cursor : undefined,
      error: syncError?.message,
    });

    if (syncError) throw syncError;
    return result;
  },
};

export const ingestWorkflow: Workflow<IngestInput, IngestOutput> = {
  name: "ingest",
  steps: [syncStep],
  async execute(input, ctx) {
    return ctx.runStep(syncStep, input);
  },
};
