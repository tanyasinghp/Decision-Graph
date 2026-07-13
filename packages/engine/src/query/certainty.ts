/**
 * query/certainty.ts — mechanical confidence propagation.
 *
 * ARCHITECTURAL DECISION: the model PROPOSES certainty; the runtime ENFORCES
 * the ceiling. An answer can never claim more certainty than its weakest
 * supporting decision's extraction confidence permits:
 *
 *   supporting confidences → ceiling:
 *     (none)            → unknown
 *     any "low"         → possible
 *     any "medium"      → likely
 *     all "high"        → known
 *
 * final = min(proposed, ceiling) on unknown < possible < likely < known.
 *
 * This is a floor-of-the-chain rule, deliberately conservative: a confident
 * narrative built on one shaky decision is a shaky answer. Downgrades are
 * recorded in the trace, so "the model said known, the graph said likely"
 * is visible rather than silent.
 */

import { z } from "zod";
import type { Confidence } from "@dg/domain/types.js";

export const CertaintySchema = z.enum(["unknown", "possible", "likely", "known"]);
export type Certainty = z.infer<typeof CertaintySchema>;

const ORDER: Certainty[] = ["unknown", "possible", "likely", "known"];

export function certaintyCeiling(supporting: Confidence[]): Certainty {
  if (supporting.length === 0) return "unknown";
  if (supporting.includes("low")) return "possible";
  if (supporting.includes("medium")) return "likely";
  return "known";
}

export function capCertainty(
  proposed: Certainty,
  supporting: Confidence[]
): { final: Certainty; ceiling: Certainty; downgraded: boolean } {
  const ceiling = certaintyCeiling(supporting);
  const final = ORDER[Math.min(ORDER.indexOf(proposed), ORDER.indexOf(ceiling))]!;
  return { final, ceiling, downgraded: ORDER.indexOf(final) < ORDER.indexOf(proposed) };
}
