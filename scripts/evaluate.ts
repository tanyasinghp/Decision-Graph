/**
 * scripts/evaluate.ts — thin wrapper over engine.evaluate().
 * Usage: npm run evaluate -- --repo razorpay/blade --component Dropdown [--component Alert] [--prompt v2]
 *
 * (Report-file aggregation across prompt versions is a CLI/surface concern and
 * is no longer done here — the script just runs the public API and prints.)
 */

import { parseArgs, requireFlag } from "./lib/cli.js";
import { platform, consoleSink } from "./lib/platform.js";

async function main(): Promise<void> {
  const { flags } = parseArgs(process.argv.slice(2));
  const repo = requireFlag(flags, "repo");
  const components = flags.get("component") ?? [];
  if (components.length === 0) throw new Error("No components. Use --component X (repeatable).");

  const { engine, workspace } = await platform(repo, {
    model: flags.get("model")?.[0],
    promptVersion: flags.get("prompt")?.[0],
  });

  for (const component of components) {
    const r = await engine.evaluate({ workspace, component, sinks: [consoleSink()] });
    if (r.status !== "completed") {
      console.error(`[evaluate] ${component}: ${r.status}${r.error ? ": " + r.error.message : ""}`);
      continue;
    }
    const m = r.output!.metrics;
    console.log(`\n[evaluate] ${component}: P=${m.precision} R=${m.recall} F1=${m.f1} halluc=${m.hallucinationRate}`);
  }
}

main().catch((e) => {
  console.error(`[evaluate] FAILED: ${(e as Error).message}`);
  process.exit(1);
});
