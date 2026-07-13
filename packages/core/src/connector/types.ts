/**
 * Connector framework — port interfaces (core owns these; implementations live
 * in @dg/connectors).
 *
 * The pipeline the whole design turns on:
 *
 *   <source> → ConnectorArtifact → Normalizer → EvidenceObject → EvidenceStore
 *            → EvidenceRepository → ExtractionAgent
 *
 * Every future source (Slack, Jira, Linear, Notion, Figma, Google Docs,
 * Confluence, transcripts) normalizes into the SAME canonical EvidenceObject,
 * so the reasoning engine never learns where evidence came from.
 */

import type {
  CommitInfo,
  DirEntry,
  IssueThread,
  PrThread,
  RunEvent,
} from "@dg/domain/types.js";
import type { Provenance, SourceSystem } from "@dg/domain/graph.js";
import type { ConnectorProgress } from "../events/WorkflowEvent.js";

/** Re-exported so surfaces depending only on @dg/core can name evidence sources. */
export type { SourceSystem } from "@dg/domain/graph.js";

/* ---------------------------- canonical evidence ---------------------------- */

export type EvidenceObjectKind =
  | "issue"
  | "pull_request"
  | "commit"
  | "file"
  | "tree"
  | "document"
  | "discussion";

/** The single canonical representation all connectors normalize into. */
export type EvidenceObject =
  | { kind: "issue"; provenance: Provenance; data: IssueThread }
  | { kind: "pull_request"; provenance: Provenance; data: PrThread }
  | { kind: "commit"; provenance: Provenance; data: CommitInfo }
  | { kind: "file"; provenance: Provenance; path: string; content: string }
  | { kind: "tree"; provenance: Provenance; entries: DirEntry[] };

/** Raw, source-tagged item before normalization. */
export interface ConnectorArtifact {
  source: SourceSystem;
  kind: EvidenceObjectKind;
  raw: unknown;
  url?: string;
}

/** Maps a source's raw artifact into the canonical EvidenceObject. */
export interface Normalizer {
  normalize(artifact: ConnectorArtifact): EvidenceObject;
}

/* ------------------------------ evidence store ------------------------------ */

export interface EvidenceWriteResult {
  added: number;
  total: number;
  byKind: Record<string, number>;
}

/** Write port: normalized evidence in, storage-agnostic. Implemented by the workspace. */
export interface EvidenceStore {
  write(objects: EvidenceObject[]): EvidenceWriteResult;
}

/* -------------------------------- connectors -------------------------------- */

export interface ConnectorCapabilities {
  /** Supports cursor-based delta sync. */
  incremental: boolean;
  /** Supports push subscription (webhooks / events). */
  webhooks: boolean;
  /** Provides its own full-text search. */
  fullText: boolean;
  artifactKinds: EvidenceObjectKind[];
}

/** Opaque per-connector configuration (credentials, repo, env var names…). */
export type ConnectorConfig = Record<string, unknown>;

/** Opaque authenticated handle returned by authenticate(). */
export interface ConnectorSession {
  readonly source: SourceSystem;
}

export interface SyncScope {
  repo: string;
  components?: string[];
  maxCommits?: number;
  hydrateTop?: number;
  /** Also sync tree + docs (files). Off by default — issues/PRs/commits only. */
  includeFiles?: boolean;
}

/** Opaque, connector-specific position; persisted on the ConnectorBinding. */
export interface SyncCursor {
  /** ISO timestamp for "updated since" incremental listing (GitHub, etc.). */
  since?: string;
  [k: string]: unknown;
}

export interface ArtifactDelta {
  added: number;
  updated: number;
}

export interface SyncResult {
  source: SourceSystem;
  counts: Record<string, number>;
  cursor: SyncCursor;
  artifacts: number;
  /** False when the sync was cancelled before completing (cursor not advanced). */
  complete: boolean;
}

export interface SyncContext {
  signal: AbortSignal;
  progress?(p: ConnectorProgress): void;
  runEvent?(e: RunEvent): void;
}

export interface Connector {
  readonly source: SourceSystem;
  readonly capabilities: ConnectorCapabilities;
  authenticate(cfg: ConnectorConfig): Promise<ConnectorSession>;
  /** Pull artifacts since `cursor` into `store`; returns counts + a new cursor. */
  sync(
    session: ConnectorSession,
    scope: SyncScope,
    store: EvidenceStore,
    ctx: SyncContext,
    cursor?: SyncCursor
  ): Promise<SyncResult>;
}

/** A source wired into a workspace, with its config and last sync position. */
export interface ConnectorBinding {
  source: SourceSystem;
  config: ConnectorConfig;
  cursor?: SyncCursor;
}
