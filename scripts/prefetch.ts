/**
 * scripts/prefetch.ts — thin wrapper over engine.ingest().
 * Usage: npm run prefetch -- --repo razorpay/blade [--max-commits 500] [--component Dropdown]
 */

import { parseArgs, requireFlag } from "./lib/cli.js";
import { platform, consoleSink, cancelOnSigint } from "./lib/platform.js";

async function main(): Promise<void> {
  const { flags } = parseArgs(process.argv.slice(2));
  const repo = requireFlag(flags, "repo");
  const { engine, workspace } = await platform(repo);
  const ac = cancelOnSigint("prefetch");

  const r = await engine.ingest({
    workspace,
    source: "github",
    scope: {
      maxCommits: Number(flags.get("max-commits")?.[0] ?? 500),
      components: flags.get("component") ?? [],
    },
    sinks: [consoleSink()],
    signal: ac.signal,
  });

  if (r.status !== "completed") {
    console.error(`[prefetch] ${r.status}${r.error ? ": " + r.error.message : ""}`);
    process.exit(r.status === "truncated" ? 4 : 1);
  }
  console.log(`\n[prefetch] ${r.output?.artifacts} artifacts — ${JSON.stringify(r.output?.counts)}`);
}

main().catch((e) => {
  console.error(`[prefetch] FAILED: ${(e as Error).message}`);
  process.exit(1);
});
