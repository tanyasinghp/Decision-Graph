/**
 * validation/metrics.ts — pure metric computation. No I/O, no LLM: given the
 * extracted set, ground-truth refs, and judge verdicts, the numbers are a
 * deterministic function. Unit-tested to pin the definitions.
 *
 * METRIC DEFINITIONS (exact):
 *  - Precision           = matched extracted (full|partial) / extracted
 *      "Of what the system asserted, how much corresponds to a real,
 *       human-documented decision."
 *  - Recall              = ground-truth units with a FULL match / GT units
 *      "Of what the humans documented, how much did we fully recover."
 *  - F1                  = harmonic mean of precision and recall.
 *  - Decision Coverage   = GT units with a full OR partial match / GT units
 *      Recall's lenient sibling: did we at least land on the decision.
 *  - Evidence Coverage   = judge-verified supported fields / (4 × extracted)
 *      Fields: hypothesis, context, chosenSolution, alternatives.
 *  - Average Confidence  = mean of {high:1, medium:0.5, low:0}; distribution
 *      and calibration (match-rate per grade) reported alongside — the mean
 *      alone is meaningless without them.
 *  - Hallucination Rate  = extracted decisions with ≥1 fabricated claim
 *      (judge-identified, contradicted-or-invented) / extracted.
 *  - Unsupported Rate    = extracted decisions graded "unsupported" / extracted.
 *      Distinct from hallucination: absence of support vs presence of falsehood.
 *  - novel               = extracted, unmatched, but supported — candidate
 *      decisions the humans never wrote down. Not a penalty: reported as a
 *      count because for THIS product they're the payoff, pending human review.
 */

import type { Confidence, DecisionObject } from "@dg/domain/types.js";
import type { MatchVerdict } from "./verdicts.js";

export interface Metrics {
  extracted: number;
  groundTruthUnits: number;
  precision: number;
  recall: number;
  f1: number;
  decisionCoverage: number;
  evidenceCoverage: number;
  averageConfidence: number;
  confidenceDistribution: Record<Confidence, number>;
  /** match rate (full|partial) among extracted decisions at each grade */
  confidenceCalibration: Record<Confidence, { total: number; matched: number }>;
  hallucinationRate: number;
  unsupportedRate: number;
  novelSupported: number;
}

const CONF_VALUE: Record<Confidence, number> = { high: 1, medium: 0.5, low: 0 };
const safeDiv = (a: number, b: number): number => (b === 0 ? 0 : a / b);
const round = (x: number): number => Math.round(x * 1000) / 1000;

export function computeMetrics(
  extracted: DecisionObject[],
  groundTruthRefs: string[],
  verdict: MatchVerdict
): Metrics {
  const matchedExtracted = new Set(verdict.matches.map((m) => m.extractedId));
  const fullGt = new Set(verdict.matches.filter((m) => m.overlap === "full").map((m) => m.groundTruthRef));
  const anyGt = new Set(verdict.matches.map((m) => m.groundTruthRef));

  // Per-decision judge grades, keyed for lookup.
  const supportBy = new Map(verdict.decisionSupport.map((s) => [s.extractedId, s]));

  const dist: Record<Confidence, number> = { high: 0, medium: 0, low: 0 };
  const calib: Record<Confidence, { total: number; matched: number }> = {
    high: { total: 0, matched: 0 }, medium: { total: 0, matched: 0 }, low: { total: 0, matched: 0 },
  };
  let confSum = 0;
  let novel = 0;
  for (const d of extracted) {
    dist[d.confidence]++;
    calib[d.confidence].total++;
    if (matchedExtracted.has(d.id)) calib[d.confidence].matched++;
    confSum += CONF_VALUE[d.confidence];
    const grade = supportBy.get(d.id)?.grade;
    if (!matchedExtracted.has(d.id) && grade === "supported") novel++;
  }

  const supportedFields = verdict.fieldSupport.reduce(
    (acc, f) => acc + Number(f.hypothesis) + Number(f.context) + Number(f.chosenSolution) + Number(f.alternatives),
    0
  );

  const precision = safeDiv(matchedExtracted.size, extracted.length);
  const recall = safeDiv(fullGt.size, groundTruthRefs.length);

  return {
    extracted: extracted.length,
    groundTruthUnits: groundTruthRefs.length,
    precision: round(precision),
    recall: round(recall),
    f1: round(safeDiv(2 * precision * recall, precision + recall)),
    decisionCoverage: round(safeDiv(anyGt.size, groundTruthRefs.length)),
    evidenceCoverage: round(safeDiv(supportedFields, 4 * extracted.length)),
    averageConfidence: round(safeDiv(confSum, extracted.length)),
    confidenceDistribution: dist,
    confidenceCalibration: calib,
    hallucinationRate: round(
      safeDiv(verdict.decisionSupport.filter((s) => s.fabricatedClaims.length > 0).length, extracted.length)
    ),
    unsupportedRate: round(
      safeDiv(verdict.decisionSupport.filter((s) => s.grade === "unsupported").length, extracted.length)
    ),
    novelSupported: novel,
  };
}
