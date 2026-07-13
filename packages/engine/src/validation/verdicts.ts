/**
 * validation/verdicts.ts — Zod schemas for judge outputs.
 * Same pattern as emit_decision: the judge's tool schema IS the runtime gate,
 * so a malformed verdict is rejected and the judge self-corrects.
 */

import { z } from "zod";

export const MatchVerdictSchema = z.object({
  matches: z.array(z.object({
    extractedId: z.string(),
    groundTruthRef: z.string(),
    overlap: z.enum(["full", "partial"]),
    rationale: z.string().min(10),
  })),
  decisionSupport: z.array(z.object({
    extractedId: z.string(),
    grade: z.enum(["supported", "weak", "unsupported"]),
    fabricatedClaims: z.array(z.string()),
  })),
  fieldSupport: z.array(z.object({
    extractedId: z.string(),
    hypothesis: z.boolean(),
    context: z.boolean(),
    chosenSolution: z.boolean(),
    alternatives: z.boolean(),
  })),
});
export type MatchVerdict = z.infer<typeof MatchVerdictSchema>;

export const FailureCategorySchema = z.enum([
  "missing_evidence",
  "weak_evidence",
  "prompt_failure",
  "repository_ambiguity",
  "insufficient_context",
  "extraction_error",
]);
export type FailureCategory = z.infer<typeof FailureCategorySchema>;

export const MissVerdictSchema = z.object({
  misses: z.array(z.object({
    groundTruthRef: z.string(),
    category: FailureCategorySchema,
    note: z.string().min(10),
  })),
});
export type MissVerdict = z.infer<typeof MissVerdictSchema>;
