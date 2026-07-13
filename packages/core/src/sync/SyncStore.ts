import type { SourceSystem } from "@dg/domain/graph.js";
import type { SyncCursor } from "../connector/types.js";

export type SyncStatus = "completed" | "running" | "cancelled" | "failed";

export interface SyncMetadata {
  schemaVersion: number;
  source: SourceSystem;
  repo: string;
  status: SyncStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  artifacts: number;
  counts: Record<string, number>;
  cursor?: SyncCursor;
  connectorVersion?: string;
  engineVersion?: string;
  error?: string;
}

export interface SyncStore {
  write(meta: SyncMetadata): void;
  latest(source: SourceSystem): SyncMetadata | undefined;
  list(): SyncMetadata[];
}
