/**
 * Workspace port (interfaces only).
 *
 * A Workspace is the named, isolated context that owns config, stores, run
 * journals and connector bindings. It is the ONLY object that resolves concrete
 * stores — no workflow constructs a CacheStore, JsonGraphStore, DecisionStore
 * or RunLog directly. Everything flows Workspace → Stores → ports.
 *
 * The concrete LocalWorkspaceProvider (today's data/ layout behind this port)
 * lives in @dg/workspace-local; a RemoteWorkspaceProvider can later satisfy the
 * same contract without the Workflow Engine changing.
 */

import type { EvidenceRepository } from "@dg/engine/evidence/EvidenceRepository.js";
import type { GraphStore } from "@dg/engine/graph/GraphStore.js";
import type { LlmClient } from "@dg/engine/llm/LlmClient.js";
import type { DecisionObject, RunEvent } from "@dg/domain/types.js";
import type { SourceSystem } from "@dg/domain/graph.js";
import type { RunStore } from "../checkpoint/RunStore.js";
import type { SyncStore } from "../sync/SyncStore.js";
import type {
  Connector,
  ConnectorBinding,
  EvidenceStore,
  SyncCursor,
} from "../connector/types.js";

export type WorkspaceRef = string;

export interface WorkspaceConfig {
  repo: string;
  model: string;
  promptVersion: string;
  toolBudget: number;
  connectors?: ConnectorBinding[];
}

export interface DecisionStore {
  save(component: string, promptVersion: string, decisions: DecisionObject[]): void;
  loadComponent(component: string, promptVersion: string): DecisionObject[];
  loadAll(promptVersion: string): DecisionObject[];
}

/** Read-only accessor for the engine's Phase 1 RunLog (used by replay). */
export interface RunLogReader {
  read(runId: string): RunEvent[];
}

export interface Stores {
  /** Omitting `source` yields a federated read view across bound connectors. */
  evidence(source?: SourceSystem): EvidenceRepository;
  /** Write port for a single source's evidence (used during ingest). */
  evidenceWrite(source: SourceSystem): EvidenceStore;
  graph(): GraphStore;
  decisions(): DecisionStore;
  runLog(): RunLogReader;
  /** Sync metadata for every connector bound to this workspace. */
  sync(): SyncStore;
}

export interface Workspace {
  readonly ref: WorkspaceRef;
  readonly config: WorkspaceConfig;
  stores(): Stores;
  /** Resolve an LLM client from config + credential binding. */
  llm(model?: string): LlmClient;
  /** Root data directory for this workspace (ground-truth, reports, etc.). */
  dataDir(): string;
  /** Directory the engine's RunLog writes to. */
  runsDir(): string;
  /** Workflow-level journal + checkpoint + step-output store. */
  runStore(): RunStore;
  /** Connector bindings configured for this workspace. */
  connectors(): ConnectorBinding[];
  /** Resolve a live connector for a bound source. */
  connector(source: SourceSystem): Connector;
  /** Persist an updated sync cursor for a source. */
  saveCursor(source: SourceSystem, cursor: SyncCursor): void;
}

export interface WorkspaceProvider {
  resolve(ref: WorkspaceRef): Promise<Workspace>;
  create(ref: WorkspaceRef, config: WorkspaceConfig): Promise<Workspace>;
  list(): Promise<WorkspaceRef[]>;
}
