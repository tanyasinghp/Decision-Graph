/**
 * scripts/export-graph.ts — thin wrapper over engine.export().
 * Usage: npm run export-graph -- --repo razorpay/blade --format mermaid [--out graph.mmd]
 */

import * as fs from "node:fs";
import { parseArgs, requireFlag } from "./lib/cli.js";
import { platform } from "./lib/platform.js";
import type { ExportFormat } from "@dg/core";

async function main(): Promise<void> {
  const { flags } = parseArgs(process.argv.slice(2));
  const repo = requireFlag(flags, "repo");
  const format = (flags.get("format")?.[0] ?? "json") as ExportFormat;
  const out = flags.get("out")?.[0];
  const { engine, workspace } = await platform(repo);

  const r = await engine.export({ workspace, format });
  if (r.status !== "completed" || !r.output) {
    console.error(`[export-graph] ${r.status}${r.error ? ": " + r.error.message : ""}`);
    process.exit(1);
  }

  if (out) {
    fs.writeFileSync(out, r.output.content, "utf8");
    console.error(`[export-graph] wrote ${out} (${format})`);
  } else {
    process.stdout.write(r.output.content);
  }
}

main().catch((e) => {
  console.error(`[export-graph] FAILED: ${(e as Error).message}`);
  process.exit(1);
});
