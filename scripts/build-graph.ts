/**
 * scripts/build-graph.ts — decisions JSON → Decision Graph.
 *
 * Usage:
 *   npm run build-graph -- --repo razorpay/blade [--prompt v2] [--link]
 *
 * Reads data/decisions/<component>.<prompt>.json (all components), builds
 * nodes+edges deterministically, upserts into data/graph.json (incremental:
 * re-running updates rather than duplicates), then optionally runs the
 * LinkingAgent (--link, needs ANTHROPIC_API_KEY) for SUPERSEDES/INFORMS.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { DecisionObjectSchema } from "../src/domain/schemas.js";
import { JsonGraphStore } from "../src/graph/GraphStore.js";
import { buildGraph } from "../src/graph/GraphBuilder.js";
import { LinkingAgent } from "../src/agent/LinkingAgent.js";
import { AnthropicClient } from "../src/llm/AnthropicClient.js";
import { DATA_DIR, parseArgs, requireEnv, requireFlag } from "./lib/cli.js";

async function main(): Promise<void> {
  const { flags, bools } = parseArgs(process.argv.slice(2));
  const repo = requireFlag(flags, "repo");
  const promptVersion = flags.get("prompt")?.[0] ?? "v2";

  const decisionsDir = path.join(DATA_DIR, "decisions");
  const files = fs.existsSync(decisionsDir)
    ? fs.readdirSync(decisionsDir).filter((f) => f.endsWith(`.${promptVersion}.json`))
    : [];
  if (files.length === 0) {
    console.error(`[build-graph] no data/decisions/*.${promptVersion}.json — run extract/evaluate first`);
    process.exit(1);
  }

  const decisions = files.flatMap((f) =>
    z.array(DecisionObjectSchema).parse(JSON.parse(fs.readFileSync(path.join(decisionsDir, f), "utf8")))
  );
  console.log(`[build-graph] ${decisions.length} decisions from ${files.length} components`);

  const store = new JsonGraphStore(DATA_DIR, repo);
  const { nodes, edges } = buildGraph(repo, decisions);
  for (const n of nodes) store.upsertNode(n);
  let edgeCount = 0;
  for (const e of edges) {
    store.addEdge(e);
    edgeCount++;
  }
  store.flush();
  console.log(`[build-graph] graph: ${store.nodes().length} nodes, ${store.edges().length} edges (+${edgeCount} asserted this run)`);

  if (bools.has("link")) {
    const model = flags.get("model")?.[0] ?? process.env.DG_MODEL ?? "claude-sonnet-4-5";
    const linker = new LinkingAgent(new AnthropicClient(requireEnv("ANTHROPIC_API_KEY"), model), store);
    const res = await linker.run();
    store.flush();
    console.log(`[build-graph] linking: ${res.accepted}/${res.proposed} edges accepted` +
      (res.rejected.length ? `; rejected: ${res.rejected.join(" | ")}` : ""));
  }
}

main().catch((e) => {
  console.error(`[build-graph] FAILED: ${(e as Error).message}`);
  process.exit(1);
});
