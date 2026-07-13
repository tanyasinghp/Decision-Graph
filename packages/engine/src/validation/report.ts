/**
 * validation/report.ts — evaluation report rendering (json + demo-ready md).
 * Pure formatting; all numbers arrive computed. The md is written for a
 * skeptical engineer audience: definitions inline, failures shown, no spin.
 */

import type { DecisionObject } from "@dg/domain/types.js";
import type { GroundTruthUnit } from "./GroundTruth.js";
import type { Metrics } from "./metrics.js";
import type { FailureCategory, MatchVerdict, MissVerdict } from "./verdicts.js";

export interface ComponentEvaluation {
  component: string;
  promptVersion: string;
  model: string;
  runId: string;
  metrics: Metrics;
  verdict: MatchVerdict;
  missAnalysis: MissVerdict;
  extracted: DecisionObject[];
  groundTruth: GroundTruthUnit[];
  stats: { toolCalls: number; costUsd: number; durationMs: number };
}

export interface EvaluationReport {
  repo: string;
  promptVersion: string;
  generatedAt: string;
  components: ComponentEvaluation[];
  aggregate: Metrics;
}

/** Micro-average across components (pool counts, recompute rates). */
export function aggregateMetrics(components: ComponentEvaluation[]): Metrics {
  const ms = components.map((c) => c.metrics);
  const sum = (f: (m: Metrics) => number): number => ms.reduce((a, m) => a + f(m), 0);
  const extracted = sum((m) => m.extracted);
  const gt = sum((m) => m.groundTruthUnits);
  const w = (f: (m: Metrics) => number, denom: (m: Metrics) => number): number => {
    const d = sum(denom);
    return d === 0 ? 0 : Math.round((sum((m) => f(m) * denom(m)) / d) * 1000) / 1000;
  };
  const precision = w((m) => m.precision, (m) => m.extracted);
  const recall = w((m) => m.recall, (m) => m.groundTruthUnits);
  const dist = { high: 0, medium: 0, low: 0 };
  const calib = { high: { total: 0, matched: 0 }, medium: { total: 0, matched: 0 }, low: { total: 0, matched: 0 } };
  for (const m of ms) {
    for (const k of ["high", "medium", "low"] as const) {
      dist[k] += m.confidenceDistribution[k];
      calib[k].total += m.confidenceCalibration[k].total;
      calib[k].matched += m.confidenceCalibration[k].matched;
    }
  }
  return {
    extracted, groundTruthUnits: gt, precision, recall,
    f1: precision + recall === 0 ? 0 : Math.round(((2 * precision * recall) / (precision + recall)) * 1000) / 1000,
    decisionCoverage: w((m) => m.decisionCoverage, (m) => m.groundTruthUnits),
    evidenceCoverage: w((m) => m.evidenceCoverage, (m) => m.extracted),
    averageConfidence: w((m) => m.averageConfidence, (m) => m.extracted),
    confidenceDistribution: dist,
    confidenceCalibration: calib,
    hallucinationRate: w((m) => m.hallucinationRate, (m) => m.extracted),
    unsupportedRate: w((m) => m.unsupportedRate, (m) => m.extracted),
    novelSupported: sum((m) => m.novelSupported),
  };
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

export function renderMarkdown(report: EvaluationReport, priorVersions: Array<{ version: string; aggregate: Metrics }>): string {
  const L: string[] = [];
  const m = report.aggregate;

  L.push(`# Decision Extraction Evaluation — ${report.repo}`);
  L.push(`Prompt version: **${report.promptVersion}** · generated ${report.generatedAt}`);
  L.push(``);
  L.push(`Extraction never sees the \`_decisions\` ground truth (enforced in code, tested). ` +
    `Matching and support grading by LLM judge with unversioned judge prompts; ` +
    `excerpt verbatim-ness is verified mechanically at emission time.`);
  L.push(``);
  L.push(`## Headline metrics`);
  L.push(``);
  L.push(`| Metric | Value | Definition |`);
  L.push(`|---|---|---|`);
  L.push(`| Precision | ${pct(m.precision)} | matched extracted / all extracted (${m.extracted}) |`);
  L.push(`| Recall | ${pct(m.recall)} | fully recovered GT units / all GT units (${m.groundTruthUnits}) |`);
  L.push(`| F1 | ${pct(m.f1)} | harmonic mean |`);
  L.push(`| Decision coverage | ${pct(m.decisionCoverage)} | GT units with full or partial match |`);
  L.push(`| Evidence coverage | ${pct(m.evidenceCoverage)} | judge-verified fields / 4×extracted |`);
  L.push(`| Avg confidence | ${m.averageConfidence.toFixed(2)} | high=1 medium=0.5 low=0 |`);
  L.push(`| Hallucination rate | ${pct(m.hallucinationRate)} | decisions with ≥1 fabricated claim |`);
  L.push(`| Unsupported rate | ${pct(m.unsupportedRate)} | decisions judged unsupported by own evidence |`);
  L.push(`| Novel supported | ${m.novelSupported} | evidenced decisions humans never documented |`);

  if (priorVersions.length > 0) {
    L.push(``, `## Prompt version comparison`, ``);
    L.push(`| Version | P | R | F1 | Coverage | Halluc. | Novel |`);
    L.push(`|---|---|---|---|---|---|---|`);
    for (const pv of [...priorVersions, { version: report.promptVersion, aggregate: m }]) {
      const a = pv.aggregate;
      L.push(`| ${pv.version} | ${pct(a.precision)} | ${pct(a.recall)} | ${pct(a.f1)} | ${pct(a.decisionCoverage)} | ${pct(a.hallucinationRate)} | ${a.novelSupported} |`);
    }
  }

  L.push(``, `## Confidence calibration`, ``);
  L.push(`| Grade | Count | Matched | Match rate |`);
  L.push(`|---|---|---|---|`);
  for (const k of ["high", "medium", "low"] as const) {
    const c = m.confidenceCalibration[k];
    L.push(`| ${k} | ${c.total} | ${c.matched} | ${c.total ? pct(c.matched / c.total) : "—"} |`);
  }
  L.push(``, `A calibrated extractor matches more often at higher grades. Inversions here are prompt bugs.`);

  for (const c of report.components) {
    L.push(``, `---`, ``, `## ${c.component} (run \`${c.runId}\`)`);
    L.push(`P ${pct(c.metrics.precision)} · R ${pct(c.metrics.recall)} · ` +
      `${c.stats.toolCalls} tool calls · $${c.stats.costUsd.toFixed(3)} · ${(c.stats.durationMs / 1000).toFixed(0)}s`);

    L.push(``, `### Recovered decisions`);
    for (const match of c.verdict.matches) {
      const d = c.extracted.find((x) => x.id === match.extractedId);
      L.push(`- **[${match.overlap}]** ${d?.title ?? match.extractedId} ← \`${match.groundTruthRef}\``);
      L.push(`  - ${match.rationale}`);
    }
    if (c.verdict.matches.length === 0) L.push(`- (none)`);

    L.push(``, `### Missed ground-truth decisions`);
    for (const miss of c.missAnalysis.misses) {
      L.push(`- \`${miss.groundTruthRef}\` — **${miss.category}**: ${miss.note}`);
    }
    if (c.missAnalysis.misses.length === 0) L.push(`- (none)`);

    const unmatched = c.extracted.filter((d) => !c.verdict.matches.some((mt) => mt.extractedId === d.id));
    L.push(``, `### Extracted but undocumented by humans (novel or unsupported)`);
    for (const d of unmatched) {
      const grade = c.verdict.decisionSupport.find((s) => s.extractedId === d.id)?.grade ?? "?";
      L.push(`- [${grade}, conf=${d.confidence}] ${d.title}`);
    }
    if (unmatched.length === 0) L.push(`- (none)`);
  }

  // Representative failures, grouped across components
  const byCategory = new Map<FailureCategory, string[]>();
  for (const c of report.components) {
    for (const miss of c.missAnalysis.misses) {
      const list = byCategory.get(miss.category) ?? [];
      if (list.length < 3) list.push(`${c.component}: ${miss.note}`);
      byCategory.set(miss.category, list);
    }
  }
  L.push(``, `---`, ``, `## Failure analysis (representative examples)`);
  for (const [cat, examples] of byCategory) {
    L.push(``, `### ${cat}`);
    for (const ex of examples) L.push(`- ${ex}`);
  }
  if (byCategory.size === 0) L.push(``, `No misses recorded.`);

  return L.join("\n") + "\n";
}
