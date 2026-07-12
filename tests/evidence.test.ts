/**
 * tests/evidence.test.ts — cache normalization, reads, dedup, invalidation,
 * repository guard enforcement, search ranking, and fetcher pagination.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CacheStore } from "../src/evidence/CacheStore.js";
import { CachedEvidenceRepository } from "../src/evidence/EvidenceRepository.js";
import { GitHubFetcher, type OctokitLike } from "../src/evidence/GitHubFetcher.js";
import { CacheMissError, ForbiddenPathError } from "../src/domain/errors.js";
import type { IssueThread, PrThread } from "../src/domain/types.js";

let tmp: string;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dg-test-")); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

const issue = (n: number, over: Partial<IssueThread> = {}): IssueThread => ({
  number: n, title: `Issue ${n}`, state: "closed", author: "dev", body: "",
  url: `https://github.com/o/r/issues/${n}`, createdAt: "2023-01-01T00:00:00Z",
  closedAt: null, labels: [], comments: [], ...over,
});

const pr = (n: number, over: Partial<PrThread> = {}): PrThread => ({
  ...issue(n), url: `https://github.com/o/r/pull/${n}`, merged: true,
  mergedAt: "2023-02-01T00:00:00Z", reviewComments: [], filesTouched: [], ...over,
});

describe("CacheStore", () => {
  it("dedups by stable id: merging same issue twice yields one entity", () => {
    const cache = new CacheStore(tmp, "o/r");
    cache.mergeIssues([issue(1), issue(1, { title: "updated" })]);
    cache.mergeIssues([issue(1, { title: "updated again" })]);
    const map = cache.readIssues();
    expect(Object.keys(map)).toEqual(["1"]);
    expect(map["1"]?.title).toBe("updated again"); // last write wins (upsert)
  });

  it("merge preserves previously hydrated data on other keys", () => {
    const cache = new CacheStore(tmp, "o/r");
    cache.mergeIssues([issue(1, { comments: [{ author: "a", body: "important context", createdAt: "", url: "" }] })]);
    cache.mergeIssues([issue(2)]);
    expect(cache.readIssues()["1"]?.comments).toHaveLength(1);
  });

  it("writes are deterministic: identical data → byte-identical files", () => {
    const a = new CacheStore(tmp, "o/a");
    const b = new CacheStore(tmp, "o/b");
    // Insert in different orders:
    a.mergeIssues([issue(2), issue(1)]);
    b.mergeIssues([issue(1)]);
    b.mergeIssues([issue(2)]);
    const bytesA = fs.readFileSync(path.join(a.dir, "issues.json"), "utf8");
    const bytesB = fs.readFileSync(path.join(b.dir, "issues.json"), "utf8");
    expect(bytesA).toBe(bytesB);
  });

  it("clear() implements --force invalidation", () => {
    const cache = new CacheStore(tmp, "o/r");
    cache.mergeIssues([issue(1)]);
    cache.writeMeta({ repo: "o/r", fetchedAt: "x", params: {}, counts: {} });
    expect(cache.exists()).toBe(true);
    cache.clear();
    expect(cache.exists()).toBe(false);
    expect(cache.readIssues()).toEqual({});
  });
});

describe("CachedEvidenceRepository", () => {
  function makeRepo(): { cache: CacheStore; repo: CachedEvidenceRepository } {
    const cache = new CacheStore(tmp, "o/r");
    const repo = new CachedEvidenceRepository(cache, "o/r");
    return { cache, repo };
  }

  it("reads issues/PRs/commits back; unique commit prefix resolves", async () => {
    const { cache, repo } = makeRepo();
    cache.mergeIssues([issue(7)]);
    cache.mergePrs([pr(9)]);
    cache.mergeCommits([{ sha: "abcdef1234", author: "dev", date: "", message: "m", url: "", filesTouched: [] }]);
    expect((await repo.getIssue(7)).number).toBe(7);
    expect((await repo.getPR(9)).merged).toBe(true);
    expect((await repo.getCommit("abcdef")).sha).toBe("abcdef1234");
  });

  it("throws recoverable CacheMissError for absent items", async () => {
    const { repo } = makeRepo();
    await expect(repo.getIssue(999)).rejects.toBeInstanceOf(CacheMissError);
  });

  it("getFile enforces the deny-list even if ground truth somehow entered the cache", async () => {
    const { cache, repo } = makeRepo();
    // Simulate a corrupted/poisoned cache — read-time wall must still hold:
    cache.writeFile("packages/x/_decisions/api.md", "SECRET GROUND TRUTH");
    await expect(repo.getFile("packages/x/_decisions/api.md")).rejects.toBeInstanceOf(ForbiddenPathError);
  });

  it("listDirectory omits deny-listed entries entirely (agent never sees the name)", async () => {
    const { cache, repo } = makeRepo();
    cache.writeTree([
      { name: "Alert.tsx", path: "packages/x/Alert.tsx", type: "file" },
      { name: "_decisions", path: "packages/x/_decisions", type: "dir" },
      { name: "decisions.md", path: "packages/x/_decisions/decisions.md", type: "file" },
    ]);
    const entries = await repo.listDirectory("packages/x");
    expect(entries.map((e) => e.name)).toEqual(["Alert.tsx"]);
  });

  it("search ranks title matches above body/comment matches, deterministically", async () => {
    const { cache, repo } = makeRepo();
    cache.mergeIssues([
      issue(1, { title: "Dropdown selection API design", body: "..." }),
      issue(2, { title: "Unrelated", body: "mentions dropdown once" }),
    ]);
    const hits = await repo.search({ query: "dropdown", type: "any", limit: 10 });
    expect(hits[0]?.number).toBe(1);
    expect(hits).toHaveLength(2);
  });
});

describe("GitHubFetcher pagination", () => {
  it("listCommits pages until maxCount and stops early on empty pages", async () => {
    const pages: Record<number, unknown[]> = {
      1: Array.from({ length: 100 }, (_, i) => ({ sha: `sha${i}`, commit: { message: "m", author: { date: "" } } })),
      2: Array.from({ length: 100 }, (_, i) => ({ sha: `sha${100 + i}`, commit: { message: "m", author: { date: "" } } })),
      3: [],
    };
    let requests = 0;
    const fake: OctokitLike = {
      paginate: async () => [],
      request: async (_route, params) => {
        requests++;
        return { data: pages[(params as { page: number }).page] ?? [] };
      },
    };
    const fetcher = new GitHubFetcher(fake, "o/r");

    const capped = await fetcher.listCommits(150);
    expect(capped).toHaveLength(150); // stops mid-page-2 at maxCount

    requests = 0;
    const all = await fetcher.listCommits(1000);
    expect(all).toHaveLength(200);
    expect(requests).toBe(3); // page 3 empty → early stop, no page 4
  });
});
