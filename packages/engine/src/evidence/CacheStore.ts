/**
 * evidence/CacheStore.ts — deterministic on-disk evidence cache.
 *
 * Layout (repo-level, per approved spec):
 *   data/cache/<owner>__<repo>/
 *     meta.json            fetch manifest: when, what params, item counts
 *     issues.json          { [number: string]: IssueThread }
 *     pull_requests.json   { [number: string]: PrThread }
 *     commits.json         { [sha: string]: CommitInfo }
 *     tree.json            DirEntry[]
 *     files/<repo path>    raw markdown/doc contents, mirrored
 *
 * ARCHITECTURAL DECISIONS:
 *  - Entities are stored as KEYED MAPS, not arrays. Keys are the natural
 *    stable ids (issue/PR number, commit sha). Dedup is therefore structural:
 *    re-fetching the same item overwrites the same key — duplicates are
 *    unrepresentable, matching the "no duplicate entities" requirement.
 *  - Writes are DETERMINISTIC: keys sorted recursively, 2-space indent,
 *    trailing newline, tmp-file + rename (atomic on POSIX). Two prefetch runs
 *    over identical upstream data produce byte-identical files — this makes
 *    cache diffs meaningful and demo runs reproducible.
 *  - The store is dumb on purpose: no domain logic, no guards. Guards belong
 *    to the read path (CachedEvidenceRepository); exclusion of ground truth
 *    belongs to the write path (prefetch). Keeping this class mechanical
 *    makes it trivially testable.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { CommitInfo, DirEntry, IssueThread, PrThread } from "@dg/domain/types.js";

/** Recursively sort object keys so JSON.stringify output is stable. */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeysDeep((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

function writeJsonAtomic(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(sortKeysDeep(data), null, 2) + "\n", "utf8");
  fs.renameSync(tmp, filePath);
}

function readJsonOr<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

export interface CacheMeta {
  repo: string;
  fetchedAt: string;
  params: Record<string, unknown>;
  counts: Record<string, number>;
}

export class CacheStore {
  readonly dir: string;

  constructor(cacheRoot: string, repo: string) {
    // "owner/repo" → "owner__repo": filesystem-safe, unambiguous, reversible.
    this.dir = path.join(cacheRoot, repo.replace("/", "__"));
  }

  exists(): boolean {
    return fs.existsSync(path.join(this.dir, "meta.json"));
  }

  /** --force semantics: drop everything for this repo and start clean. */
  clear(): void {
    fs.rmSync(this.dir, { recursive: true, force: true });
  }

  /* ---------------- meta ---------------- */

  readMeta(): CacheMeta | undefined {
    return readJsonOr<CacheMeta | undefined>(path.join(this.dir, "meta.json"), undefined);
  }

  writeMeta(meta: CacheMeta): void {
    writeJsonAtomic(path.join(this.dir, "meta.json"), meta);
  }

  /* ---------------- issues / PRs / commits (keyed maps) ---------------- */

  readIssues(): Record<string, IssueThread> {
    return readJsonOr(path.join(this.dir, "issues.json"), {});
  }

  /** Merge = upsert by key. Returns count of new keys for progress reporting. */
  mergeIssues(items: IssueThread[]): number {
    const map = this.readIssues();
    let added = 0;
    for (const it of items) {
      if (!(String(it.number) in map)) added++;
      map[String(it.number)] = it;
    }
    writeJsonAtomic(path.join(this.dir, "issues.json"), map);
    return added;
  }

  readPrs(): Record<string, PrThread> {
    return readJsonOr(path.join(this.dir, "pull_requests.json"), {});
  }

  mergePrs(items: PrThread[]): number {
    const map = this.readPrs();
    let added = 0;
    for (const it of items) {
      if (!(String(it.number) in map)) added++;
      map[String(it.number)] = it;
    }
    writeJsonAtomic(path.join(this.dir, "pull_requests.json"), map);
    return added;
  }

  readCommits(): Record<string, CommitInfo> {
    return readJsonOr(path.join(this.dir, "commits.json"), {});
  }

  mergeCommits(items: CommitInfo[]): number {
    const map = this.readCommits();
    let added = 0;
    for (const it of items) {
      if (!(it.sha in map)) added++;
      map[it.sha] = it;
    }
    writeJsonAtomic(path.join(this.dir, "commits.json"), map);
    return added;
  }

  /* ---------------- tree + files ---------------- */

  readTree(): DirEntry[] {
    return readJsonOr(path.join(this.dir, "tree.json"), []);
  }

  writeTree(entries: DirEntry[]): void {
    // Sorted by path for determinism.
    writeJsonAtomic(
      path.join(this.dir, "tree.json"),
      [...entries].sort((a, b) => a.path.localeCompare(b.path))
    );
  }

  private fileDiskPath(repoPath: string): string {
    // Mirror the repo path under files/. path.join normalizes separators.
    return path.join(this.dir, "files", repoPath);
  }

  hasFile(repoPath: string): boolean {
    return fs.existsSync(this.fileDiskPath(repoPath));
  }

  readFile(repoPath: string): string | undefined {
    const p = this.fileDiskPath(repoPath);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : undefined;
  }

  writeFile(repoPath: string, content: string): void {
    const p = this.fileDiskPath(repoPath);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, "utf8");
  }
}
