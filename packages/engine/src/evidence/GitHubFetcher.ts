/**
 * evidence/GitHubFetcher.ts — the ONLY module that talks to the GitHub API.
 *
 * ARCHITECTURAL DECISIONS:
 *  - Imported exclusively by acquisition scripts (prefetch, fetch-ground-truth).
 *    The extraction agent has no code path here — "no live GitHub calls during
 *    extraction" is enforced by the import graph, not by discipline.
 *  - Depends on an OctokitLike interface, not the Octokit class. The real
 *    client (createOctokit) brings retry + throttling via the `octokit`
 *    meta-package plugins; tests inject a fake with canned pages. This is the
 *    only DI seam this module needs — anything more would be over-engineering.
 *  - Normalization happens HERE, at the network boundary. Everything past
 *    this point speaks domain shapes (IssueThread, PrThread, CommitInfo);
 *    GitHub's API shapes never leak into the rest of the system, so an API
 *    change touches exactly one file.
 */

import { Octokit } from "octokit";
import type {
  CachedComment,
  CommitInfo,
  DirEntry,
  IssueThread,
  PrThread,
} from "@dg/domain/types.js";

/** The narrow surface we need — both real Octokit and test fakes satisfy it. */
export interface OctokitLike {
  paginate(route: string, params?: Record<string, unknown>): Promise<unknown[]>;
  request(route: string, params?: Record<string, unknown>): Promise<{ data: unknown }>;
}

export function createOctokit(token: string): OctokitLike {
  // The `octokit` meta-package bundles retry + throttling plugins.
  // onRateLimit: retry up to twice, honoring GitHub's Retry-After.
  return new Octokit({
    auth: token,
    throttle: {
      onRateLimit: (_retryAfter: number, _opts: unknown, _o: unknown, retryCount: number) =>
        retryCount < 2,
      onSecondaryRateLimit: (_retryAfter: number, _opts: unknown, _o: unknown, retryCount: number) =>
        retryCount < 2,
    },
  }) as unknown as OctokitLike;
}

/* GitHub API response fragments we actually read (typed minimally on purpose). */
interface RawUser { login?: string }
interface RawComment { user?: RawUser; body?: string; created_at?: string; html_url?: string }
interface RawIssue {
  number: number; title?: string; state?: string; user?: RawUser; body?: string | null;
  html_url?: string; created_at?: string; closed_at?: string | null;
  labels?: Array<{ name?: string } | string>; pull_request?: unknown;
  merged_at?: string | null; comments?: number;
}

function normComment(c: RawComment): CachedComment {
  return {
    author: c.user?.login ?? "unknown",
    body: c.body ?? "",
    createdAt: c.created_at ?? "",
    url: c.html_url ?? "",
  };
}

function normLabels(labels: RawIssue["labels"]): string[] {
  return (labels ?? []).map((l) => (typeof l === "string" ? l : l.name ?? "")).filter(Boolean);
}

export class GitHubFetcher {
  private readonly owner: string;
  private readonly repo: string;

  constructor(private readonly octokit: OctokitLike, repoSlug: string) {
    const [owner, repo] = repoSlug.split("/");
    if (!owner || !repo) throw new Error(`Invalid repo slug: ${repoSlug}`);
    this.owner = owner;
    this.repo = repo;
  }

  private p(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { owner: this.owner, repo: this.repo, per_page: 100, ...extra };
  }

  async getRepoMeta(): Promise<Record<string, unknown>> {
    const { data } = await this.octokit.request("GET /repos/{owner}/{repo}", this.p());
    const d = data as Record<string, unknown>;
    return {
      fullName: d.full_name,
      description: d.description,
      defaultBranch: d.default_branch,
      stars: d.stargazers_count,
    };
  }

  /**
   * Lists issues AND PRs in one paginated pass (GitHub's issues endpoint
   * returns both; PRs carry a `pull_request` marker). Comments are NOT
   * hydrated here — hydration is a separate, targeted step because it costs
   * one API call per item and most items never get read by the agent.
   */
  async listIssuesAndPrs(sinceIso?: string): Promise<{ issues: IssueThread[]; prs: IssueThread[] }> {
    const raw = (await this.octokit.paginate(
      "GET /repos/{owner}/{repo}/issues",
      this.p({ state: "all", since: sinceIso, sort: "updated", direction: "desc" })
    )) as RawIssue[];

    const issues: IssueThread[] = [];
    const prs: IssueThread[] = [];
    for (const r of raw) {
      const base: IssueThread = {
        number: r.number,
        title: r.title ?? "",
        state: r.state ?? "unknown",
        author: r.user?.login ?? "unknown",
        body: r.body ?? "",
        url: r.html_url ?? "",
        createdAt: r.created_at ?? "",
        closedAt: r.closed_at ?? null,
        labels: normLabels(r.labels),
        comments: [], // hydrated separately
      };
      (r.pull_request ? prs : issues).push(base);
    }
    return { issues, prs };
  }

  async getIssueComments(issueNumber: number): Promise<CachedComment[]> {
    const raw = (await this.octokit.paginate(
      "GET /repos/{owner}/{repo}/issues/{issue_number}/comments",
      this.p({ issue_number: issueNumber })
    )) as RawComment[];
    return raw.map(normComment);
  }

  /** Hydrates a PR into a full PrThread: body + issue comments + review comments + files. */
  async hydratePr(base: IssueThread): Promise<PrThread> {
    const [{ data: prData }, comments, reviewComments, files] = await Promise.all([
      this.octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", this.p({ pull_number: base.number })),
      this.getIssueComments(base.number),
      this.octokit.paginate("GET /repos/{owner}/{repo}/pulls/{pull_number}/comments", this.p({ pull_number: base.number })),
      this.octokit.paginate("GET /repos/{owner}/{repo}/pulls/{pull_number}/files", this.p({ pull_number: base.number })),
    ]);
    const pr = prData as RawIssue;
    return {
      ...base,
      comments,
      merged: Boolean(pr.merged_at),
      mergedAt: pr.merged_at ?? null,
      reviewComments: (reviewComments as RawComment[]).map(normComment),
      filesTouched: (files as Array<{ filename?: string }>).map((f) => f.filename ?? "").filter(Boolean),
    };
  }

  async listCommits(maxCount: number, pathFilter?: string): Promise<CommitInfo[]> {
    // paginate() has no hard cap param; we page manually to stop early.
    const out: CommitInfo[] = [];
    let page = 1;
    while (out.length < maxCount) {
      const { data } = await this.octokit.request(
        "GET /repos/{owner}/{repo}/commits",
        this.p({ page, path: pathFilter })
      );
      const batch = data as Array<{
        sha: string; html_url?: string;
        commit?: { message?: string; author?: { name?: string; date?: string } };
        author?: RawUser;
      }>;
      if (batch.length === 0) break;
      for (const c of batch) {
        out.push({
          sha: c.sha,
          author: c.author?.login ?? c.commit?.author?.name ?? "unknown",
          date: c.commit?.author?.date ?? "",
          message: c.commit?.message ?? "",
          url: c.html_url ?? "",
          filesTouched: [], // per-commit file lists cost 1 call each; fetched lazily if ever needed
        });
        if (out.length >= maxCount) break;
      }
      page++;
    }
    return out;
  }

  async getTree(defaultBranch: string): Promise<DirEntry[]> {
    const { data } = await this.octokit.request(
      "GET /repos/{owner}/{repo}/git/trees/{tree_sha}",
      this.p({ tree_sha: defaultBranch, recursive: "1" })
    );
    const tree = (data as { tree?: Array<{ path?: string; type?: string }> }).tree ?? [];
    return tree
      .filter((e): e is { path: string; type: string } => Boolean(e.path && e.type))
      .map((e) => ({
        name: e.path.split("/").pop() ?? e.path,
        path: e.path,
        type: e.type === "tree" ? ("dir" as const) : ("file" as const),
      }));
  }

  async getFileContent(repoPath: string): Promise<string> {
    const { data } = await this.octokit.request(
      "GET /repos/{owner}/{repo}/contents/{path}",
      this.p({ path: repoPath })
    );
    const d = data as { content?: string; encoding?: string };
    if (d.content && d.encoding === "base64") {
      return Buffer.from(d.content, "base64").toString("utf8");
    }
    throw new Error(`Unexpected contents response for ${repoPath}`);
  }
}
