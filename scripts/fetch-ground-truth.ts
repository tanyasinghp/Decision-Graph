/**
 * scripts/fetch-ground-truth.ts — downloads ONLY the held-out evaluation set.
 *
 * Fetches all "_decisions" markdown docs (packages/<any>/_decisions/<any>.md)
 * into data/ground-truth/<owner>__<repo>/.
 *
 * ARCHITECTURAL SEPARATION (why this is a different script, not a prefetch flag):
 *  - Different destination: data/ground-truth/ is not under data/cache/, so
 *    the CacheStore used by the evidence layer physically cannot serve it.
 *  - Different code path: CachedEvidenceRepository never receives this
 *    directory's location; there is no API from agent-land to here.
 *  - Inverse filter: prefetch SKIPS guard-failing paths; this script fetches
 *    ONLY guard-failing paths. The same isForbiddenPath() predicate defines
 *    both sides of the wall, so the split is exhaustive and can't drift.
 *
 * Usage: npm run ground-truth -- --repo razorpay/blade
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { GitHubFetcher, createOctokit } from "@dg/engine/evidence/GitHubFetcher.js";
import { isForbiddenPath } from "@dg/engine/evidence/guards.js";
import { DATA_DIR, parseArgs, requireEnv, requireFlag } from "./lib/cli.js";

async function main(): Promise<void> {
  const { flags, bools } = parseArgs(process.argv.slice(2));
  const repo = requireFlag(flags, "repo");
  const force = bools.has("force");

  const destRoot = path.join(DATA_DIR, "ground-truth", repo.replace("/", "__"));
  const fetcher = new GitHubFetcher(createOctokit(requireEnv("GITHUB_TOKEN")), repo);

  const meta = await fetcher.getRepoMeta();
  const tree = await fetcher.getTree(String(meta.defaultBranch ?? "master"));

  const groundTruthPaths = tree
    .filter((e) => e.type === "file" && e.path.endsWith(".md"))
    .map((e) => e.path)
    .filter((p) => isForbiddenPath(p)); // the exact complement of what prefetch allows

  console.log(`[ground-truth] ${groundTruthPaths.length} decision docs found in ${repo}`);

  let fetched = 0;
  for (const p of groundTruthPaths) {
    const dest = path.join(destRoot, p);
    if (fs.existsSync(dest) && !force) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, await fetcher.getFileContent(p), "utf8");
    fetched++;
    console.log(`[ground-truth]   ${p}`);
  }
  console.log(`[ground-truth] done: ${fetched} fetched, ${groundTruthPaths.length - fetched} already present`);
  console.log(`[ground-truth] stored under ${destRoot} — OUTSIDE the evidence cache.`);
}

main().catch((e) => {
  console.error(`[ground-truth] FAILED: ${(e as Error).message}`);
  process.exit(1);
});
