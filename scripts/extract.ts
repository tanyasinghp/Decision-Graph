/**
 * scripts/extract.ts — thin wrapper over engine.extract().
 * Usage: npm run extract -- --repo razorpay/blade --component Dropdown [--budget 30] [--prompt v2] [--model …]
 * Ctrl-C cancels cleanly (the run becomes resumable).
 */

import { parseArgs, requireFlag } from "./lib/cli.js";
import { platform, consoleSink, cancelOnSigint } from "./lib/platform.js";

async function main(): Promise<void> {
  const { flags } = parseArgs(process.argv.slice(2));
  const repo = requireFlag(flags, "repo");
  const component = requireFlag(flags, "component");

  const budget = flags.get("budget")?.[0];
  const { engine, workspace } = await platform(repo, {
    model: flags.get("model")?.[0],
    promptVersion: flags.get("prompt")?.[0],
    toolBudget: budget ? Number(budget) : undefined,
  });
  const ac = cancelOnSigint("extract");

  const r = await engine.extract({
    workspace,
    components: [component],
    sinks: [consoleSink()],
    signal: ac.signal,
  });

  if (r.status !== "completed") {
    console.error(`[extract] ${r.status}${r.error ? ": " + r.error.message : ""}`);
    process.exit(r.status === "truncated" ? 4 : 1);
  }
  for (const c of r.output?.components ?? []) {
    console.log(
      `\n[extract] ${c.status}: ${c.decisions.length} decisions (${c.component}) ` +
        `cost=$${c.stats.costUsd.toFixed(3)} time=${(c.stats.durationMs / 1000).toFixed(1)}s`
    );
  }
}

main().catch((e) => {
  console.error(`[extract] FAILED: ${(e as Error).message}`);
  process.exit(1);
});
