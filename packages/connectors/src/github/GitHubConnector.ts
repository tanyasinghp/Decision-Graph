/**
 * GitHubConnector — Connector #1.
 *
 * Wraps the existing GitHubFetcher (never rewrites it). Responsible only for
 * authentication, discovery, checkpoint-aware incremental synchronization, and
 * normalization into canonical EvidenceObjects written through an EvidenceStore.
 * It contains no reasoning logic.
 *
 * Incrementality: GitHubFetcher.listIssuesAndPrs(since) filters by "updated
 * since", so the cursor is simply the ISO timestamp of the last completed sync.
 * Resumability: on cancellation the connector returns `complete: false` and
 * leaves the cursor untouched, so the next run re-lists from the same point and
 * the idempotent evidence store dedupes — no duplicates, no lost work.
 */

import { GitHubFetcher, createOctokit, type OctokitLike } from "@dg/engine/evidence/GitHubFetcher.js";
import type { IssueThread, PrThread } from "@dg/domain/types.js";
import type {
  Connector,
  ConnectorCapabilities,
  ConnectorConfig,
  ConnectorSession,
  EvidenceObject,
  EvidenceStore,
  SyncContext,
  SyncCursor,
  SyncResult,
  SyncScope,
} from "@dg/core/connector/types.js";
import { GitHubNormalizer } from "./GitHubNormalizer.js";

interface GitHubSession extends ConnectorSession {
  readonly octokit: OctokitLike;
}

const prShell = (it: IssueThread): PrThread => ({
  ...it,
  merged: false,
  mergedAt: null,
  reviewComments: [],
  filesTouched: [],
});

export class GitHubConnector implements Connector {
  readonly source = "github" as const;
  readonly capabilities: ConnectorCapabilities = {
    incremental: true,
    webhooks: false,
    fullText: false,
    artifactKinds: ["issue", "pull_request", "commit"],
  };

  private readonly normalizer = new GitHubNormalizer();

  /** cfg: { octokit? } (tests inject a fake) | { token } | { tokenEnv }. */
  async authenticate(cfg: ConnectorConfig): Promise<ConnectorSession> {
    const injected = cfg.octokit as OctokitLike | undefined;
    if (injected) {
      const session: GitHubSession = { source: this.source, octokit: injected };
      return session;
    }
    const token =
      (cfg.token as string | undefined) ??
      (cfg.tokenEnv ? process.env[cfg.tokenEnv as string] : process.env.GITHUB_TOKEN);
    if (!token) throw new Error("GitHubConnector: no token (set cfg.token, cfg.tokenEnv, or GITHUB_TOKEN)");
    const session: GitHubSession = { source: this.source, octokit: createOctokit(token) };
    return session;
  }

  async sync(
    session: ConnectorSession,
    scope: SyncScope,
    store: EvidenceStore,
    ctx: SyncContext,
    cursor?: SyncCursor
  ): Promise<SyncResult> {
    const octokit = (session as GitHubSession).octokit;
    const fetcher = new GitHubFetcher(octokit, scope.repo);
    const counts: Record<string, number> = { issues: 0, prs: 0, commits: 0 };

    const incomplete = (): SyncResult => ({
      source: this.source,
      counts,
      cursor: cursor ?? {},
      artifacts: counts.issues! + counts.prs! + counts.commits!,
      complete: false,
    });

    if (ctx.signal.aborted) return incomplete();

    // 1. Issues + PRs (incremental via cursor.since)
    const { issues, prs } = await fetcher.listIssuesAndPrs(cursor?.since);

    const issueObjs: EvidenceObject[] = issues.map((i) =>
      this.normalizer.normalize({ source: this.source, kind: "issue", raw: i, url: i.url })
    );
    counts.issues = store.write(issueObjs).added;
    ctx.progress?.({ source: this.source, message: "issues", current: issues.length, total: issues.length });
    if (ctx.signal.aborted) return incomplete();

    const prObjs: EvidenceObject[] = prs.map((p) =>
      this.normalizer.normalize({ source: this.source, kind: "pull_request", raw: prShell(p), url: p.url })
    );
    counts.prs = store.write(prObjs).added;
    ctx.progress?.({ source: this.source, message: "pull_requests", current: prs.length, total: prs.length });
    if (ctx.signal.aborted) return incomplete();

    // 2. Commits
    const commits = await fetcher.listCommits(scope.maxCommits ?? 500);
    const commitObjs: EvidenceObject[] = commits.map((c) =>
      this.normalizer.normalize({ source: this.source, kind: "commit", raw: c, url: c.url })
    );
    counts.commits = store.write(commitObjs).added;
    ctx.progress?.({ source: this.source, message: "commits", current: commits.length, total: commits.length });
    if (ctx.signal.aborted) return incomplete();

    return {
      source: this.source,
      counts,
      cursor: { since: new Date().toISOString() },
      artifacts: counts.issues + counts.prs + counts.commits,
      complete: true,
    };
  }
}
