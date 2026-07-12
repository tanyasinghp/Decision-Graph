/**
 * scripts/export-graph.ts — graph → json | graphml | mermaid on stdout/file.
 * Usage: npm run export-graph -- --repo razorpay/blade --format mermaid [--out graph.mmd]
 */

import * as fs from "node:fs";
import { JsonGraphStore } from "../src/graph/GraphStore.js";
import { toGraphML, toJson, toMermaid } from "../src/graph/export.js";
import { DATA_DIR, parseArgs, requireFlag } from "./lib/cli.js";

function main(): void {
  const { flags } = parseArgs(process.argv.slice(2));
  const repo = requireFlag(flags, "repo");
  const format = flags.get("format")?.[0] ?? "json";
  const out = flags.get("out")?.[0];

  const store = new JsonGraphStore(DATA_DIR, repo);
  const content =
    format === "graphml" ? toGraphML(store)
    : format === "mermaid" ? toMermaid(store)
    : toJson(store);

  if (out) {
    fs.writeFileSync(out, content, "utf8");
    console.error(`[export-graph] wrote ${out} (${format})`);
  } else {
    process.stdout.write(content);
  }
}

main();
