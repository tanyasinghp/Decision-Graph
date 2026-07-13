/**
 * LocalStores — resolves every concrete store from the local data/ layout.
 *
 * This is the single place CacheStore / JsonGraphStore / CachedEvidenceRepository
 * / RunLog are instantiated. Workflows never touch them directly.
 *
 * Cache location (backward compatible): GitHub keeps the existing
 * data/cache/<owner__repo> path; any additional source is namespaced under
 * data/cache/<source>/<owner__repo> so multiple connectors don't collide.
 */

import * as path from "node:path";
import { CacheStore } from "@dg/engine/evidence/CacheStore.js";
import { CachedEvidenceRepository } from "@dg/engine/evidence/EvidenceRepository.js";
import { JsonGraphStore } from "@dg/engine/graph/GraphStore.js";
import { RunLog } from "@dg/engine/agent/RunLog.js";
import type { EvidenceRepository } from "@dg/engine/evidence/EvidenceRepository.js";
import type { GraphStore } from "@dg/engine/graph/GraphStore.js";
import type { SourceSystem } from "@dg/domain/graph.js";
import type {
  ConnectorBinding,
  DecisionStore,
  EvidenceStore,
  RunLogReader,
  Stores,
  SyncStore,
} from "@dg/core";
import { FederatedEvidenceRepository, type FederatedSource } from "@dg/connectors";
import { LocalDecisionStore } from "./LocalDecisionStore.js";
import { LocalEvidenceStore } from "./LocalEvidenceStore.js";
import { LocalSyncStore } from "./LocalSyncStore.js";

export class LocalStores implements Stores {
  private graphStore: JsonGraphStore | undefined;
  private syncStore: SyncStore | undefined;
  private readonly caches = new Map<SourceSystem, CacheStore>();

  constructor(
    private readonly dataDir: string,
    private readonly repo: string,
    private readonly runsDir: string,
    private readonly bindings: ConnectorBinding[]
  ) {}

  private cacheRoot(source: SourceSystem): string {
    // GitHub uses the existing top-level cache dir for backward compatibility.
    return source === "github"
      ? path.join(this.dataDir, "cache")
      : path.join(this.dataDir, "cache", source);
  }

  private cacheFor(source: SourceSystem): CacheStore {
    let c = this.caches.get(source);
    if (!c) {
      c = new CacheStore(this.cacheRoot(source), this.repo);
      this.caches.set(source, c);
    }
    return c;
  }

  private boundSources(): SourceSystem[] {
    const s = this.bindings.map((b) => b.source);
    return s.length ? s : ["github"];
  }

  evidence(source?: SourceSystem): EvidenceRepository {
    if (source) return new CachedEvidenceRepository(this.cacheFor(source), this.repo);
    const sources: FederatedSource[] = this.boundSources().map((s) => ({
      source: s,
      repo: new CachedEvidenceRepository(this.cacheFor(s), this.repo),
    }));
    // One source needs no federation overhead, but the federated view exposes
    // exactly the same interface, so returning it uniformly is fine either way.
    return sources.length === 1 ? sources[0]!.repo : new FederatedEvidenceRepository(sources);
  }

  evidenceWrite(source: SourceSystem): EvidenceStore {
    return new LocalEvidenceStore(this.cacheFor(source));
  }

  graph(): GraphStore {
    if (!this.graphStore) this.graphStore = new JsonGraphStore(this.dataDir, this.repo);
    return this.graphStore;
  }

  decisions(): DecisionStore {
    return new LocalDecisionStore(path.join(this.dataDir, "decisions"));
  }

  runLog(): RunLogReader {
    const dir = this.runsDir;
    return { read: (id: string) => RunLog.read(dir, id) };
  }

  sync(): SyncStore {
    if (!this.syncStore) this.syncStore = new LocalSyncStore(this.dataDir);
    return this.syncStore;
  }
}
