/**
 * tests/connectors.test.ts — Phase 2.5 connector framework.
 *
 * Registration, GitHubConnector sync (via a fake OctokitLike — no network),
 * incremental synchronization, resume after an interrupted sync, normalization
 * / provenance preservation, and the FederatedEvidenceRepository.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConnectorRegistry, type EvidenceObject, type SyncScope } from "@dg/core";
import { GitHubConnector, GitHubNormalizer, FederatedEvidenceRepository } from "@dg/connectors";
import { CacheStore } from "@dg/engine/evidence/CacheStore.js";
import { CachedEvidenceRepository } from "@dg/engine/evidence/EvidenceRepository.js";
import type { OctokitLike } from "@dg/engine/evidence/GitHubFetcher.js";
import type { IssueThread } from "@dg/domain/types.js";
import { LocalEvidenceStore } from "@dg/workspace-local";

/* ---------------------------- fake GitHub API ---------------------------- */

interface RawIssue {
  number: number; title: string; state: string; user: { login: string };
  body: string; html_url: string; created_at: string; updated_at: string;
  closed_at: string | null; labels: string[]; pull_request?: unknown;
}

function cannedIssues(): RawIssue[] {
  return [
    { number: 1, title: "Dropdown a11y", state: "closed", user: { login: "alice" }, body: "native select fails", html_url: "https://github.com/o/r/issues/1", created_at: "2023-01-01T00:00:00Z", updated_at: "2023-01-01T00:00:00Z", closed_at: "2023-01-02T00:00:00Z", labels: ["a11y"] },
    { number: 2, title: "Focus mgmt", state: "open", user: { login: "bob" }, body: "keyboard nav", html_url: "https://github.com/o/r/issues/2", created_at: "2023-02-01T00:00:00Z", updated_at: "2023-06-01T00:00:00Z", closed_at: null, labels: [] },
    { number: 3, title: "feat: controlled dropdown", state: "closed", user: { login: "carol" }, body: "PR body", html_url: "https://github.com/o/r/pull/3", created_at: "2023-03-01T00:00:00Z", updated_at: "2023-03-05T00:00:00Z", closed_at: "2023-03-06T00:00:00Z", labels: [], pull_request: { url: "x" } },
  ];
}

function cannedCommits() {
  return [
    { sha: "a1b2c3d4e5f6", html_url: "https://github.com/o/r/commit/a1b2c3d4e5f6", commit: { message: "fix nav", author: { name: "alice", date: "2023-04-01T00:00:00Z" } }, author: { login: "alice" } },
    { sha: "0f9e8d7c6b5a", html_url: "https://github.com/o/r/commit/0f9e8d7c6b5a", commit: { message: "refactor", author: { name: "bob", date: "2023-04-02T00:00:00Z" } }, author: { login: "bob" } },
  ];
}

function fakeOctokit(spy?: { since?: string }): OctokitLike {
  return {
    async paginate(route: string, params?: Record<string, unknown>): Promise<unknown[]> {
      if (route.includes("/issues")) {
        const since = params?.since as string | undefined;
        if (spy) spy.since = since;
        return cannedIssues().filter((i) => !since || i.updated_at > since);
      }
      return [];
    },
    async request(route: string, params?: Record<string, unknown>): Promise<{ data: unknown }> {
      if (route.includes("/commits")) {
        const page = (params?.page as number) ?? 1;
        return { data: page === 1 ? cannedCommits() : [] };
      }
      return { data: {} };
    },
  };
}

const SCOPE: SyncScope = { repo: "o/r", maxCommits: 50 };

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dg-conn-"));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

/* ------------------------------- registry -------------------------------- */

describe("ConnectorRegistry", () => {
  it("registers and resolves connectors by source", () => {
    const reg = new ConnectorRegistry().register(new GitHubConnector());
    expect(reg.has("github")).toBe(true);
    expect(reg.list()).toEqual(["github"]);
    expect(reg.get("github").source).toBe("github");
    expect(() => reg.get("slack")).toThrow(/No connector/);
  });
});

/* ------------------------------ normalization ---------------------------- */

describe("GitHubNormalizer — provenance preservation", () => {
  it("stamps github provenance onto canonical EvidenceObjects", () => {
    const norm = new GitHubNormalizer();
    const issue: IssueThread = {
      number: 7, title: "t", state: "open", author: "a", body: "b",
      url: "https://github.com/o/r/issues/7", createdAt: "2023-01-01", closedAt: null,
      labels: [], comments: [],
    };
    const obj = norm.normalize({ source: "github", kind: "issue", raw: issue, url: issue.url });
    expect(obj.kind).toBe("issue");
    expect(obj.provenance.source).toBe("github");
    expect(obj.provenance.origin).toBe("connector:github");
    expect(obj.provenance.url).toBe(issue.url);
  });
});

/* --------------------------- GitHubConnector sync ------------------------ */

describe("GitHubConnector", () => {
  const store = (dir = tmp) => new LocalEvidenceStore(new CacheStore(path.join(dir, "cache"), "o/r"));

  it("authenticates with an injected octokit and syncs issues/PRs/commits", async () => {
    const connector = new GitHubConnector();
    const session = await connector.authenticate({ octokit: fakeOctokit() });
    const cache = new CacheStore(path.join(tmp, "cache"), "o/r");
    const result = await connector.sync(session, SCOPE, new LocalEvidenceStore(cache), { signal: new AbortController().signal });

    expect(result.complete).toBe(true);
    expect(result.counts).toEqual({ issues: 2, prs: 1, commits: 2 });
    expect(result.cursor.since).toBeTruthy();
    // written through the real CacheStore in the existing format
    expect(Object.keys(cache.readIssues())).toHaveLength(2);
    expect(Object.keys(cache.readPrs())).toHaveLength(1);
    expect(Object.keys(cache.readCommits())).toHaveLength(2);
  });

  it("supports incremental synchronization via the cursor", async () => {
    const connector = new GitHubConnector();
    const spy: { since?: string } = {};
    const session = await connector.authenticate({ octokit: fakeOctokit(spy) });
    const cache = new CacheStore(path.join(tmp, "cache"), "o/r");
    const es = new LocalEvidenceStore(cache);

    const first = await connector.sync(session, SCOPE, es, { signal: new AbortController().signal });
    expect(first.counts.issues).toBe(2);

    // Second pass with a cursor past all updated_at → nothing new.
    const second = await connector.sync(session, SCOPE, es, { signal: new AbortController().signal }, { since: "2024-01-01T00:00:00Z" });
    expect(spy.since).toBe("2024-01-01T00:00:00Z"); // cursor.since was passed to the API
    expect(second.counts.issues).toBe(0);
    expect(second.counts.prs).toBe(0);
    expect(second.counts.commits).toBe(0); // deduped by CacheStore
  });

  it("resumes cleanly after an interrupted sync (no duplicates)", async () => {
    const connector = new GitHubConnector();
    const session = await connector.authenticate({ octokit: fakeOctokit() });
    const cache = new CacheStore(path.join(tmp, "cache"), "o/r");
    const es = new LocalEvidenceStore(cache);

    // Abort right after the issues phase.
    const ac = new AbortController();
    const interrupted = await connector.sync(session, SCOPE, es, {
      signal: ac.signal,
      progress: (p) => {
        if (p.message === "issues") ac.abort();
      },
    });
    expect(interrupted.complete).toBe(false);
    expect(Object.keys(cache.readIssues())).toHaveLength(2);
    expect(Object.keys(cache.readPrs())).toHaveLength(0); // never reached

    // Resume with a fresh signal and the unchanged cursor.
    const resumed = await connector.sync(session, SCOPE, es, { signal: new AbortController().signal });
    expect(resumed.complete).toBe(true);
    expect(resumed.counts.issues).toBe(0); // already present — idempotent
    expect(Object.keys(cache.readIssues())).toHaveLength(2); // no duplicates
    expect(Object.keys(cache.readPrs())).toHaveLength(1);
    expect(Object.keys(cache.readCommits())).toHaveLength(2);
  });
});

/* ----------------------- FederatedEvidenceRepository --------------------- */

describe("FederatedEvidenceRepository", () => {
  it("aggregates multiple sources and routes reads to whichever has the item", async () => {
    // Two independent caches standing in for two sources.
    const cacheA = new CacheStore(path.join(tmp, "a"), "o/r");
    const cacheB = new CacheStore(path.join(tmp, "b"), "o/r");
    const mkIssue = (n: number): IssueThread => ({
      number: n, title: `issue ${n}`, state: "open", author: "x", body: "", url: `u${n}`,
      createdAt: "2023-01-01", closedAt: null, labels: [], comments: [],
    });
    cacheA.mergeIssues([mkIssue(1)]);
    cacheB.mergeIssues([mkIssue(2)]);

    const federated = new FederatedEvidenceRepository([
      { source: "github", repo: new CachedEvidenceRepository(cacheA, "o/r") },
      { source: "linear", repo: new CachedEvidenceRepository(cacheB, "o/r") },
    ]);

    expect(federated.sourceList()).toEqual(["github", "linear"]);
    // routed to source A
    expect((await federated.getIssue(1)).number).toBe(1);
    // A misses → routed to source B (provenance of each source preserved)
    expect((await federated.getIssue(2)).number).toBe(2);
  });

  it("merges search hits across sources", async () => {
    const cacheA = new CacheStore(path.join(tmp, "a"), "o/r");
    const cacheB = new CacheStore(path.join(tmp, "b"), "o/r");
    const mk = (n: number, body: string): IssueThread => ({
      number: n, title: `dropdown ${n}`, state: "open", author: "x", body, url: `u${n}`,
      createdAt: "2023-01-01", closedAt: null, labels: [], comments: [],
    });
    cacheA.mergeIssues([mk(1, "dropdown selection")]);
    cacheB.mergeIssues([mk(2, "dropdown focus")]);

    const federated = new FederatedEvidenceRepository([
      { source: "github", repo: new CachedEvidenceRepository(cacheA, "o/r") },
      { source: "linear", repo: new CachedEvidenceRepository(cacheB, "o/r") },
    ]);
    const hits = await federated.search({ query: "dropdown", type: "issue", limit: 10 });
    const numbers = hits.map((h) => h.number).sort();
    expect(numbers).toEqual([1, 2]); // no source dropped
  });
});
