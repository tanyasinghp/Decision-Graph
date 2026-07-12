/**
 * scripts/extract.ts — extraction composition root.
 *
 * Usage:
 *   npm run extract -- --repo razorpay/blade --component Dropdown
 *   npm run extract -- --repo razorpay/blade --component Dropdown --budget 30
 *
 * Ctrl-C cancels cleanly: the abort signal stops the loop at the next
 * checkpoint and the run log records everything up to that point.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { CacheStore } from "../src/evidence/CacheStore.js";
import { CachedEvidenceRepository } from "../src/evidence/EvidenceRepository.js";
import { AnthropicClient } from "../src/llm/AnthropicClient.js";
import { ExtractionAgent } from "../src/agent/ExtractionAgent.js";
import { ConfigError } from "../src/domain/errors.js";
import { DATA_DIR, parseArgs, requireEnv, requireFlag } from "./lib/cli.js";

async function main(): Promise<void> {
  const { flags } = parseArgs(process.argv.slice(2));
  const repo = requireFlag(flags, "repo");
  const component = requireFlag(flags, "component");
  const budget = Number(flags.get("budget")?.[0] ?? process.env.DG_TOOL_BUDGET ?? 25);
  const model = flags.get("model")?.[0] ?? process.env.DG_MODEL ?? "claude-sonnet-4-5";
  const promptVersion = flags.get("prompt")?.[0] ?? "v2";

  const cache = new CacheStore(path.join(DATA_DIR, "cache"), repo);
  if (!cache.exists()) {
    throw new ConfigError(`No evidence cache for ${repo}. Run: npm run prefetch -- --repo ${repo}`);
  }

  const agent = new ExtractionAgent(
    new AnthropicClient(requireEnv("ANTHROPIC_API_KEY"), model),
    new CachedEvidenceRepository(cache, repo),
    {
      repo,
      promptVersion,
      runsDir: path.join(DATA_DIR, "runs"),
      toolBudget: budget,
      maxTurns: 60,
      maxTokens: 8192,
      pricing: { inputPerMTok: 3, outputPerMTok: 15 }, // Sonnet-class; update if model changes
    }
  );

  const abort = new AbortController();
  process.on("SIGINT", () => {
    console.log("\n[extract] cancelling...");
    abort.abort();
  });

  console.log(`[extract] ${repo} :: ${component} (model=${model}, budget=${budget})`);
  const result = await agent.run(component, {
    signal: abort.signal,
    onEvent: (e) => {
      // Live console trace — the same events the UI will consume.
      if (e.t === "phase") console.log(`\n== ${e.name.toUpperCase()} ==`);
      if (e.t === "tool_call") console.log(`  → ${e.name} ${JSON.stringify(e.input).slice(0, 120)}`);
      if (e.t === "tool_result" && e.isError) console.log(`    ✗ ${e.summary.slice(0, 100)}`);
      if (e.t === "decision_emitted") console.log(`  ★ ${e.decisionId} [${e.confidence}] ${e.title}`);
      if (e.t === "decision_rejected") console.log(`  ✗ decision rejected: ${e.errors[0]?.slice(0, 100)}`);
    },
  });

  // Persist decisions for the graph layer (Module 4 consumes this file).
  const outDir = path.join(DATA_DIR, "decisions");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${component.toLowerCase()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(result.decisions, null, 2) + "\n", "utf8");

  console.log(`\n[extract] ${result.status}: ${result.decisions.length} decisions → ${outFile}`);
  console.log(
    `[extract] run=${result.runId} toolCalls=${result.stats.toolCalls} ` +
      `tokens=${result.stats.inputTokens}in/${result.stats.outputTokens}out ` +
      `cost=$${result.stats.costUsd.toFixed(3)} time=${(result.stats.durationMs / 1000).toFixed(1)}s`
  );
}

main().catch((e) => {
  console.error(`[extract] FAILED: ${(e as Error).message}`);
  process.exit(1);
});
