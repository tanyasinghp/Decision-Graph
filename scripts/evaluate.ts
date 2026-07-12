/**
 * scripts/evaluate.ts — the benchmark composition root.
 *
 * Usage:
 *   npm run evaluate -- --repo razorpay/blade --component Dropdown --component Alert --prompt v2
 *   npm run evaluate -- --repo razorpay/blade --all-components --prompt v1
 *   npm run evaluate -- --repo razorpay/blade --component Dropdown --use-cached   # skip re-extraction
 *
 * Per component: extract (or load cached decisions) → judge match → mechanical
 * miss diagnostics → judge miss categorization → metrics. Then aggregate,
 * write reports/evaluation-<prompt>.json + evaluation.md (with side-by-side
 * comparison against every other version's stored json).
 *
 * DECISION: prompt comparison reads PERSISTED reports rather than re-running
 * old versions — benchmark results are append-only artifacts, so comparisons
 * are reproducible and cost nothing.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { CacheStore } from "../src/evidence/CacheStore.js";
import { CachedEvidenceRepository } from "../src/evidence/EvidenceRepository.js";
import { AnthropicClient } from "../src/llm/AnthropicClient.js";
import { ExtractionAgent } from "../src/agent/ExtractionAgent.js";
import { RunLog } from "../src/agent/RunLog.js";
import { GroundTruth } from "../src/validation/GroundTruth.js";
import { Judge, computeMissDiagnostics } from "../src/validation/Judge.js";
import { computeMetrics } from "../src/validation/metrics.js";
import { aggregateMetrics, renderMarkdown, type ComponentEvaluation, type EvaluationReport } from "../src/validation/report.js";
import { DecisionObjectSchema } from "../src/domain/schemas.js";
import { ConfigError } from "../src/domain/errors.js";
import type { DecisionObject } from "../src/domain/types.js";
import { z } from "zod";
import { DATA_DIR, parseArgs, requireEnv, requireFlag } from "./lib/cli.js";

async function main(): Promise<void> {
  const { flags, bools } = parseArgs(process.argv.slice(2));
  const repo = requireFlag(flags, "repo");
  const promptVersion = flags.get("prompt")?.[0] ?? "v2";
  const model = flags.get("model")?.[0] ?? process.env.DG_MODEL ?? "claude-sonnet-4-5";
  const judgeModel = flags.get("judge-model")?.[0] ?? model;
  const budget = Number(flags.get("budget")?.[0] ?? process.env.DG_TOOL_BUDGET ?? 25);
  const useCached = bools.has("use-cached");

  const groundTruth = new GroundTruth(path.join(DATA_DIR, "ground-truth"), repo);
  const components = bools.has("all-components")
    ? groundTruth.componentsAvailable()
    : flags.get("component") ?? [];
  if (components.length === 0) {
    throw new ConfigError("No components. Use --component X (repeatable) or --all-components.");
  }

  const cache = new CacheStore(path.join(DATA_DIR, "cache"), repo);
  if (!cache.exists()) throw new ConfigError(`No cache for ${repo}. Run prefetch first.`);
  const evidence = new CachedEvidenceRepository(cache, repo);
  const apiKey = requireEnv("ANTHROPIC_API_KEY");
  const judge = new Judge(new AnthropicClient(apiKey, judgeModel));

  const evals: ComponentEvaluation[] = [];

  for (const component of components) {
    console.log(`\n[evaluate] === ${component} (prompt ${promptVersion}) ===`);
    const gt = groundTruth.forComponent(component);
    console.log(`[evaluate] ground truth: ${gt.length} units`);

    // 1. Extraction (or cached decisions from a previous run of this version)
    let decisions: DecisionObject[];
    let runId: string;
    let stats = { toolCalls: 0, costUsd: 0, durationMs: 0 };
    const decisionsFile = path.join(DATA_DIR, "decisions", `${component.toLowerCase()}.${promptVersion}.json`);

    if (useCached && fs.existsSync(decisionsFile)) {
      decisions = z.array(DecisionObjectSchema).parse(JSON.parse(fs.readFileSync(decisionsFile, "utf8")));
      runId = decisions[0]?.extraction.runId ?? "unknown";
      console.log(`[evaluate] using ${decisions.length} cached decisions (${runId})`);
    } else {
      const agent = new ExtractionAgent(new AnthropicClient(apiKey, model), evidence, {
        repo, promptVersion,
        runsDir: path.join(DATA_DIR, "runs"),
        toolBudget: budget, maxTurns: 60, maxTokens: 8192,
        pricing: { inputPerMTok: 3, outputPerMTok: 15 },
      });
      const result = await agent.run(component, {
        onEvent: (e) => {
          if (e.t === "tool_call") process.stdout.write(".");
          if (e.t === "decision_emitted") process.stdout.write("★");
        },
      });
      console.log("");
      decisions = result.decisions;
      runId = result.runId;
      stats = { toolCalls: result.stats.toolCalls, costUsd: result.stats.costUsd, durationMs: result.stats.durationMs };
      fs.mkdirSync(path.dirname(decisionsFile), { recursive: true });
      fs.writeFileSync(decisionsFile, JSON.stringify(decisions, null, 2) + "\n", "utf8");
      console.log(`[evaluate] extracted ${decisions.length} decisions ($${stats.costUsd.toFixed(3)})`);
    }

    // 2. Judge: match + support + field attribution
    const verdict = await judge.match(component, decisions, gt);
    console.log(`[evaluate] judge: ${verdict.matches.length} matches`);

    // 3. Misses: mechanical diagnostics → judge categorization
    const matchedRefs = new Set(verdict.matches.map((m) => m.groundTruthRef));
    const missedUnits = gt.filter((u) => !matchedRefs.has(u.ref));
    const events = fs.existsSync(path.join(DATA_DIR, "runs", `${runId}.jsonl`))
      ? RunLog.read(path.join(DATA_DIR, "runs"), runId)
      : [];
    const diagnostics = await computeMissDiagnostics({ missedUnits, events, evidence, toolBudget: budget });
    const missAnalysis = await judge.analyzeMisses(component, diagnostics, gt);

    // 4. Metrics
    const metrics = computeMetrics(decisions, gt.map((u) => u.ref), verdict);
    console.log(`[evaluate] P=${metrics.precision} R=${metrics.recall} F1=${metrics.f1} halluc=${metrics.hallucinationRate}`);

    evals.push({ component, promptVersion, model, runId, metrics, verdict, missAnalysis, extracted: decisions, groundTruth: gt, stats });
  }

  // 5. Reports
  const report: EvaluationReport = {
    repo, promptVersion,
    generatedAt: new Date().toISOString(),
    components: evals,
    aggregate: aggregateMetrics(evals),
  };

  const reportsDir = path.join(DATA_DIR, "..", "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(path.join(reportsDir, `evaluation-${promptVersion}.json`), JSON.stringify(report, null, 2) + "\n", "utf8");

  // Cross-version comparison from persisted reports of OTHER versions.
  const priors = fs.readdirSync(reportsDir)
    .filter((f) => /^evaluation-v.+\.json$/.test(f) && f !== `evaluation-${promptVersion}.json`)
    .map((f) => {
      const r = JSON.parse(fs.readFileSync(path.join(reportsDir, f), "utf8")) as EvaluationReport;
      return { version: r.promptVersion, aggregate: r.aggregate };
    });

  fs.writeFileSync(path.join(reportsDir, "evaluation.md"), renderMarkdown(report, priors), "utf8");
  console.log(`\n[evaluate] wrote reports/evaluation-${promptVersion}.json and reports/evaluation.md`);
  console.log(`[evaluate] aggregate: P=${report.aggregate.precision} R=${report.aggregate.recall} F1=${report.aggregate.f1}`);
}

main().catch((e) => {
  console.error(`[evaluate] FAILED: ${(e as Error).message}`);
  process.exit(1);
});
