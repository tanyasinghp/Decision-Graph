/**
 * scripts/prefetch.ts — acquisition composition root.
 *
 * Usage:
 *   npm run prefetch -- --repo razorpay/blade
 *   npm run prefetch -- --repo razorpay/blade --component Dropdown --component Alert
 *   npm run prefetch -- --repo razorpay/blade --force
 *
 * Pipeline: metadata → tree → docs (rfcs/*.md, docs/**, root *.md) →
 * issues+PRs listing → targeted comment hydration → commits.
 *
 * DECISION — hydration budget: listing all issues/PRs is cheap (100/page),
 * but comments cost ~1–3 calls per item. We therefore hydrate:
 *   - items matching --component terms (title/body/labels), plus
 *   - the top --hydrate-top most-discussed remaining items (default 150).
 * This keeps a blade-sized repo prefetch in the low hundreds of calls while
 * capturing the discussion-rich threads where decisions actually live.
 *
 * DECISION — ground truth never enters this cache: any tree path failing the
 * guard check is skipped at download time (write-time enforcement; read-time
 * guards in the repository are the second wall).
 */

import { CacheStore } from "../src/evidence/CacheStore.js";
import { GitHubFetcher, createOctokit } from "../src/evidence/GitHubFetcher.js";
import { isForbiddenPath } from "../src/evidence/guards.js";
import type { IssueThread, PrThread } from "../src/domain/types.js";
import { DATA_DIR, parseArgs, requireEnv, requireFlag } from "./lib/cli.js";
import * as path from "node:path";

const DOC_PATTERNS: Array<(p: string) => boolean> = [
  (p) => p.startsWith("rfcs/") && p.endsWith(".md"),
  (p) => p.startsWith("docs/") && (p.endsWith(".md") || p.endsWith(".mdx")),
  (p) => !p.includes("/") && p.endsWith(".md"), // root-level README, CONTRIBUTING...
];

async function main(): Promise<void> {
  const { flags, bools } = parseArgs(process.argv.slice(2));
  const repo = requireFlag(flags, "repo");
  const components = (flags.get("component") ?? []).map((c) => c.toLowerCase());
  const hydrateTop = Number(flags.get("hydrate-top")?.[0] ?? 150);
  const maxCommits = Number(flags.get("max-commits")?.[0] ?? 500);
  const force = bools.has("force");

  const cache = new CacheStore(path.join(DATA_DIR, "cache"), repo);
  if (force) cache.clear();

  const fetcher = new GitHubFetcher(createOctokit(requireEnv("GITHUB_TOKEN")), repo);

  console.log(`[prefetch] ${repo} → ${cache.dir}`);
  const meta = await fetcher.getRepoMeta();
  const defaultBranch = String(meta.defaultBranch ?? "master");

  // 1. Tree ------------------------------------------------------------
  const tree = await fetcher.getTree(defaultBranch);
  cache.writeTree(tree);
  console.log(`[prefetch] tree: ${tree.length} entries`);

  // 2. Docs (skip already-cached unless --force; skip ground truth always)
  const docPaths = tree
    .filter((e) => e.type === "file")
    .map((e) => e.path)
    .filter((p) => DOC_PATTERNS.some((match) => match(p)))
    .filter((p) => !isForbiddenPath(p)); // ← write-time ground-truth exclusion

  let docsFetched = 0;
  for (const p of docPaths) {
    if (cache.hasFile(p)) continue; // idempotent re-runs
    try {
      cache.writeFile(p, await fetcher.getFileContent(p));
      docsFetched++;
    } catch (e) {
      console.warn(`[prefetch] skip ${p}: ${(e as Error).message}`);
    }
  }
  console.log(`[prefetch] docs: ${docsFetched} fetched, ${docPaths.length - docsFetched} cached`);

  // 3. Issues + PRs listing ---------------------------------------------
  const { issues, prs } = await fetcher.listIssuesAndPrs();
  console.log(`[prefetch] listed ${issues.length} issues, ${prs.length} PRs`);

  // 4. Targeted hydration -------------------------------------------------
  const matchesComponent = (it: IssueThread): boolean =>
    components.length > 0 &&
    components.some(
      (c) =>
        it.title.toLowerCase().includes(c) ||
        it.body.toLowerCase().includes(c) ||
        it.labels.some((l) => l.toLowerCase().includes(c))
    );

  const pickForHydration = (items: IssueThread[]): IssueThread[] => {
    const componentMatched = items.filter(matchesComponent);
    const rest = items.filter((it) => !componentMatched.includes(it));
    // "Most discussed first" proxy: we don't have comment counts on the list
    // response we normalized, so use body length as a cheap richness signal.
    rest.sort((a, b) => b.body.length - a.body.length);
    return [...componentMatched, ...rest.slice(0, Math.max(0, hydrateTop - componentMatched.length))];
  };

  const issuesCached = cache.readIssues();
  const issuesToHydrate = pickForHydration(issues).filter(
    (it) => force || !issuesCached[String(it.number)]?.comments.length
  );
  console.log(`[prefetch] hydrating ${issuesToHydrate.length} issues...`);
  const hydratedIssues: IssueThread[] = [];
  for (const it of issuesToHydrate) {
    hydratedIssues.push({ ...it, comments: await fetcher.getIssueComments(it.number) });
  }
  // Merge order matters: listings first (upsert shells), hydrated after (overwrite with comments).
  cache.mergeIssues(issues.filter((i) => !issuesToHydrate.includes(i)));
  cache.mergeIssues(hydratedIssues);

  const prsCached = cache.readPrs();
  const prsToHydrate = pickForHydration(prs).filter(
    (it) => force || !prsCached[String(it.number)]?.comments.length
  );
  console.log(`[prefetch] hydrating ${prsToHydrate.length} PRs...`);
  const hydratedPrs: PrThread[] = [];
  for (const it of prsToHydrate) {
    try {
      hydratedPrs.push(await fetcher.hydratePr(it));
    } catch (e) {
      console.warn(`[prefetch] PR #${it.number} hydration failed: ${(e as Error).message}`);
    }
  }
  const prShell = (it: IssueThread): PrThread => ({
    ...it, merged: false, mergedAt: null, reviewComments: [], filesTouched: [],
  });
  cache.mergePrs(prs.filter((p) => !prsToHydrate.includes(p)).map(prShell));
  cache.mergePrs(hydratedPrs);

  // 5. Commits -----------------------------------------------------------
  const commits = await fetcher.listCommits(maxCommits);
  cache.mergeCommits(commits);
  console.log(`[prefetch] commits: ${commits.length}`);

  cache.writeMeta({
    repo,
    fetchedAt: new Date().toISOString(),
    params: { components, hydrateTop, maxCommits, defaultBranch },
    counts: {
      issues: Object.keys(cache.readIssues()).length,
      prs: Object.keys(cache.readPrs()).length,
      commits: Object.keys(cache.readCommits()).length,
      docs: docPaths.length,
      tree: tree.length,
    },
  });
  console.log(`[prefetch] done. meta:`, cache.readMeta()?.counts);
}

main().catch((e) => {
  console.error(`[prefetch] FAILED: ${(e as Error).message}`);
  process.exit(1);
});
