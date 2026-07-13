/**
 * scripts/replay.ts — thin wrapper over engine.replay().
 * Usage: npm run replay -- --repo razorpay/blade --run <runId>
 * Re-emits a recorded run's events (no model call) through the console sink.
 */

import { parseArgs, requireFlag } from "./lib/cli.js";
import { platform, consoleSink } from "./lib/platform.js";

async function main(): Promise<void> {
  const { flags } = parseArgs(process.argv.slice(2));
  const repo = requireFlag(flags, "repo");
  const runId = requireFlag(flags, "run");
  const { engine, workspace } = await platform(repo);

  const r = await engine.replay({ workspace, recordedRunId: runId, sinks: [consoleSink()] });
  if (r.status !== "completed") {
    console.error(`[replay] ${r.status}${r.error ? ": " + r.error.message : ""}`);
    process.exit(1);
  }
  console.log(`\n[replay] ${runId}: ${r.output?.events} events`);
}

main().catch((e) => {
  console.error(`[replay] FAILED: ${(e as Error).message}`);
  process.exit(1);
});
