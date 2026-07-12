/**
 * evidence/EvidenceRepository.ts — the port the rest of the system depends on.
 *
 * ARCHITECTURAL DECISION: consumers (agent tools, validator) depend on this
 * interface and cannot tell whether evidence came from GitHub or a cache —
 * that's the requirement, and it's also what makes a future LiveEvidence-
 * Repository (or SlackEvidenceRepository) a drop-in.
 *
 * CachedEvidenceRepository is the Phase 1 implementation:
 *  - Reads exclusively from CacheStore (never the network).
 *  - Consults guards on EVERY path-touching call. listDirectory silently
 *    omits deny-listed entries (the agent shouldn't even see the name);
 *    getFile throws ForbiddenPathError (recoverable → Claude is told no).
 *  - Throws CacheMissError for absent items so the agent can route around
 *    holes in the cache instead of crashing the run.
 */

import { CacheMissError } from "../domain/errors.js";
import type {
  CommitInfo,
  DirEntry,
  FileContent,
  IssueThread,
  PrThread,
  SearchHit,
  SearchQuery,
} from "../domain/types.js";
import type { CacheStore } from "./CacheStore.js";
import { EvidenceIndex } from "./EvidenceIndex.js";
import { assertAllowedPath, isForbiddenPath } from "./guards.js";

export interface EvidenceRepository {
  search(q: SearchQuery): Promise<SearchHit[]>;
  getIssue(number: number): Promise<IssueThread>;
  getPR(number: number): Promise<PrThread>;
  getCommit(shaPrefix: string): Promise<CommitInfo>;
  getFile(path: string): Promise<FileContent>;
  listDirectory(path: string): Promise<DirEntry[]>;
}

export class CachedEvidenceRepository implements EvidenceRepository {
  private index: EvidenceIndex | undefined; // built lazily, reused across calls

  constructor(
    private readonly cache: CacheStore,
    private readonly repoSlug: string
  ) {}

  private getIndex(): EvidenceIndex {
    if (!this.index) {
      this.index = new EvidenceIndex(this.cache.readIssues(), this.cache.readPrs());
    }
    return this.index;
  }

  async search(q: SearchQuery): Promise<SearchHit[]> {
    return this.getIndex().search(q);
  }

  async getIssue(number: number): Promise<IssueThread> {
    const item = this.cache.readIssues()[String(number)];
    if (!item) throw new CacheMissError(`issue #${number}`);
    return item;
  }

  async getPR(number: number): Promise<PrThread> {
    const item = this.cache.readPrs()[String(number)];
    if (!item) throw new CacheMissError(`PR #${number}`);
    return item;
  }

  async getCommit(shaPrefix: string): Promise<CommitInfo> {
    const commits = this.cache.readCommits();
    const exact = commits[shaPrefix];
    if (exact) return exact;
    // Support short SHAs the way git does: unique-prefix match.
    const matches = Object.keys(commits).filter((sha) => sha.startsWith(shaPrefix));
    const first = matches[0];
    if (matches.length === 1 && first) return commits[first]!;
    throw new CacheMissError(
      matches.length > 1 ? `ambiguous commit prefix ${shaPrefix}` : `commit ${shaPrefix}`
    );
  }

  async getFile(path: string): Promise<FileContent> {
    assertAllowedPath(path); // ForbiddenPathError on _decisions/** — by design
    const content = this.cache.readFile(path);
    if (content === undefined) throw new CacheMissError(`file ${path}`);
    return {
      path,
      content,
      url: `https://github.com/${this.repoSlug}/blob/master/${path}`,
    };
  }

  async listDirectory(path: string): Promise<DirEntry[]> {
    // Deny-listed entries are OMITTED, not errored: the agent never learns
    // the ground-truth directory exists. (Asking about a name you can see
    // invites probing; a name you can't see doesn't.)
    const prefix = path === "" ? "" : path.replace(/\/+$/, "") + "/";
    return this.cache
      .readTree()
      .filter((e) => {
        if (isForbiddenPath(e.path)) return false;
        if (!e.path.startsWith(prefix)) return false;
        const rest = e.path.slice(prefix.length);
        return rest.length > 0 && !rest.includes("/"); // direct children only
      })
      .sort((a, b) => a.path.localeCompare(b.path));
  }
}
