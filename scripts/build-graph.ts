/**
 * scripts/build-graph.ts — thin wrapper over engine.buildGraph().
 * Usage: npm run build-graph -- --repo razorpay/blade [--prompt v2] [--link]
 */

import { parseArgs, requireFlag } from "./lib/cli.js";
import { platform, consoleSink } from "./lib/platform.js";

async function main(): Promise<void> {
  const { flags, bools } = parseArgs(process.argv.slice(2));
  const repo = requireFlag(flags, "repo");
  const { engine, workspace } = await platform(repo, { promptVersion: flags.get("prompt")?.[0] });

  const r = await engine.buildGraph({ workspace, link: bools.has("link"), sinks: [consoleSink()] });
  if (r.status !== "completed") {
    console.error(`[build-graph] ${r.status}${r.error ? ": " + r.error.message : ""}`);
    process.exit(1);
  }
  const o = r.output!;
  console.log(`\n[build-graph] graph: ${o.nodes} nodes, ${o.edges} edges (+${o.assertedEdges} asserted)`);
  if (o.linked) console.log(`[build-graph] linking: ${o.linked.accepted}/${o.linked.proposed} edges accepted`);
}

main().catch((e) => {
  console.error(`[build-graph] FAILED: ${(e as Error).message}`);
  process.exit(1);
});
