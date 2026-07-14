/**
 * FederatedEvidenceRepository — one EvidenceRepository view over many sources.
 *
 * Exposes EXACTLY the existing EvidenceRepository interface, so ExtractionAgent
 * / QueryEngine consume it unchanged and never learn evidence is federated.
 * Reads try each source in binding order (first hit wins); searches merge and
 * rank across sources. Provenance is preserved: no source is dropped, ordering
 * is stable, and each member repository already answers for its own source.
 */

import type { EvidenceRepository } from "@dg/engine/evidence/EvidenceRepository.js";
import type {
  CommitInfo,
  DirEntry,
  FileContent,
  IssueThread,
  PrThread,
  SearchHit,
  SearchQuery,
} from "@dg/domain/types.js";
import type { SourceSystem } from "@dg/domain/graph.js";
import { CacheMissError, ForbiddenPathError } from "@dg/domain/errors.js";

export interface FederatedSource {
  source: SourceSystem;
  repo: EvidenceRepository;
}

export class FederatedEvidenceRepository implements EvidenceRepository {
  constructor(private readonly sources: FederatedSource[]) {
    if (sources.length === 0) throw new Error("FederatedEvidenceRepository needs at least one source");
  }

  /** Which sources this view spans (binding order). */
  sourceList(): SourceSystem[] {
    return this.sources.map((s) => s.source);
  }

  async search(q: SearchQuery): Promise<SearchHit[]> {
    const all: SearchHit[] = [];
    for (const { repo } of this.sources) {
      all.push(...(await repo.search(q)));
    }
    // Merge + rank; keep every source's hits (dedupe only exact ids).
    const seen = new Set<string>();
    const merged = all.filter((h) => (seen.has(h.id) ? false : (seen.add(h.id), true)));
    merged.sort((a, b) => b.score - a.score);
    return merged.slice(0, q.limit);
  }

  private async firstHit<T>(op: (repo: EvidenceRepository) => Promise<T>, miss: string): Promise<T> {
    let lastMiss: unknown;
    for (const { repo } of this.sources) {
      try {
        return await op(repo);
      } catch (e) {
        if (e instanceof CacheMissError) {
          lastMiss = e;
          continue; // route around holes — try the next source
        }
        throw e; // ForbiddenPathError and everything else propagate immediately
      }
    }
    throw lastMiss instanceof Error ? lastMiss : new CacheMissError(miss);
  }

  getIssue(number: number): Promise<IssueThread> {
    return this.firstHit((r) => r.getIssue(number), `issue #${number}`);
  }

  getPR(number: number): Promise<PrThread> {
    return this.firstHit((r) => r.getPR(number), `PR #${number}`);
  }

  getCommit(shaPrefix: string): Promise<CommitInfo> {
    return this.firstHit((r) => r.getCommit(shaPrefix), `commit ${shaPrefix}`);
  }

  async getFile(path: string): Promise<FileContent> {
    // ForbiddenPathError must surface (guard), so firstHit only swallows misses.
    return this.firstHit((r) => r.getFile(path), `file ${path}`);
  }

  async listDirectory(path: string): Promise<DirEntry[]> {
    const byPath = new Map<string, DirEntry>();
    for (const { repo } of this.sources) {
      for (const entry of await repo.listDirectory(path)) {
        if (!byPath.has(entry.path)) byPath.set(entry.path, entry);
      }
    }
    return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
  }
}
