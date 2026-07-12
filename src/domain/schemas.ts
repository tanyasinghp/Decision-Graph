/**
 * domain/schemas.ts — THE single source of truth for every data shape.
 *
 * ARCHITECTURAL DECISION: one Zod schema serves three consumers at once:
 *   1. The Anthropic tool definition (via zod-to-json-schema) — what Claude
 *      is *allowed* to send to emit_decision.
 *   2. The runtime gate — what we *accept* (parse, don't trust).
 *   3. TypeScript types (z.infer) — what the rest of the codebase compiles against.
 * Because all three derive from the same definition, the "evidence gate" can
 * never drift between prompt-time contract and runtime enforcement. This is
 * the core faithfulness mechanism of the system.
 *
 * DECISION: fields Claude must never control (id, extraction provenance) are
 * added server-side via `.extend()` on a separate schema. Claude's input
 * schema (DecisionInputSchema) and the persisted object (DecisionObjectSchema)
 * are distinct on purpose.
 */

import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Evidence                                                            */
/* ------------------------------------------------------------------ */

export const EvidenceKindSchema = z.enum([
  "pr",
  "issue",
  "discussion",
  "commit",
  "rfc",
  "doc",
]);

export const EvidenceSchema = z.object({
  /** Stable id derived from the artifact, e.g. "pr-1234", "commit-ab12ef3". */
  id: z.string().min(1),
  kind: EvidenceKindSchema,
  /**
   * Must be a real, clickable github.com URL. In the demo, every citation is
   * click-through-verifiable; the schema makes non-GitHub URLs unrepresentable.
   */
  url: z
    .string()
    .url()
    .refine((u) => u.startsWith("https://github.com/"), {
      message: "evidence url must be a https://github.com/ URL",
    }),
  title: z.string().min(1),
  /**
   * Verbatim quote from the source that supports the claim. Min length blocks
   * token-level non-quotes ("yes", "+1"); max keeps context windows sane.
   * The validator later mechanically checks containment against cached source.
   */
  excerpt: z.string().min(20).max(1500),
  /** ISO date of the artifact, when known. */
  date: z.string().optional(),
});

/* ------------------------------------------------------------------ */
/* Decision Objects                                                    */
/* ------------------------------------------------------------------ */

export const AlternativeSchema = z.object({
  option: z.string().min(1),
  reasonRejected: z.string().min(1),
  /**
   * May be empty: an alternative inferred from discussion context is still
   * worth recording, but the empty list is visible — the UI will render it
   * as "inferred", never silently equal to evidenced alternatives.
   */
  evidenceIds: z.array(z.string()),
});

export const ConfidenceSchema = z.enum(["high", "medium", "low"]);

export const DecisionStatusSchema = z.enum(["adopted", "superseded", "revisited"]);

/** What Claude is allowed to pass to emit_decision. */
export const DecisionInputSchema = z.object({
  title: z
    .string()
    .min(8)
    .max(160)
    .describe("Short assertive title, e.g. 'Dropdown exposes a controlled-only API'"),
  scope: z.object({
    component: z.string().min(1),
    area: z.string().optional(),
  }),
  status: DecisionStatusSchema,
  hypothesis: z
    .string()
    .min(20)
    .describe("What the team believed would be true if they made this choice"),
  context: z
    .string()
    .min(20)
    .describe("What prompted the decision — the problem or trigger"),
  alternatives: z.array(AlternativeSchema),
  chosenSolution: z.string().min(20),
  tradeOffs: z.array(z.string()),
  /**
   * THE GATE. `.min(1)`: a decision with zero evidence is unrepresentable.
   * Combined with EvidenceSchema's url/excerpt constraints, "hallucinated
   * decision" becomes a schema violation, not a review finding.
   */
  evidence: z.array(EvidenceSchema).min(1),
  expectedOutcome: z.string().optional(),
  /**
   * Nullable, not optional: Claude must EXPLICITLY say "no follow-up evidence
   * found" (null) rather than omitting the field. Honest nulls are a feature.
   */
  observedOutcome: z.string().nullable(),
  confidence: ConfidenceSchema,
  /** Forces Claude to justify the grade — inspectable in run logs and the UI. */
  confidenceRationale: z.string().min(10),
  /** GitHub logins of people visible in the evidence. */
  actors: z.array(z.string()),
  /** Approximate ISO date, derived from evidence dates. */
  decidedAt: z.string().optional(),
});

/** Server-side provenance. Never supplied by Claude. */
export const ExtractionMetaSchema = z.object({
  runId: z.string(),
  model: z.string(),
  toolCalls: z.number().int().nonnegative(),
  ts: z.string(),
});

/** The persisted Decision Object. */
export const DecisionObjectSchema = DecisionInputSchema.extend({
  id: z.string().min(1),
  extraction: ExtractionMetaSchema,
});

/* ------------------------------------------------------------------ */
/* Graph                                                               */
/* ------------------------------------------------------------------ */
/* The graph data model (13 node types, 12 edge types, provenance,     */
/* confidence-on-edges, endpoint rules) lives in domain/graph.ts —     */
/* superseded the v1 schema when artifacts became first-class nodes.   */

/* ------------------------------------------------------------------ */
/* Tool inputs (the non-emit tools)                                    */
/* ------------------------------------------------------------------ */

export const SearchItemsInputSchema = z.object({
  query: z.string().min(2).describe("Keywords to search across titles, bodies and comments"),
  type: z
    .enum(["pr", "issue", "discussion", "any"])
    .default("any")
    .describe("Restrict to a single artifact type"),
  limit: z.number().int().min(1).max(25).default(10),
});

export const ReadIssueInputSchema = z.object({
  number: z.number().int().positive().describe("Issue number"),
});

export const ReadPrInputSchema = z.object({
  number: z.number().int().positive().describe("Pull request number"),
  full: z
    .boolean()
    .default(false)
    .describe("Return untruncated comment bodies (use only when truncation hid something important)"),
});

export const ReadCommitInputSchema = z.object({
  sha: z.string().min(6).describe("Commit SHA (short or full)"),
});

export const ReadFileInputSchema = z.object({
  path: z.string().min(1).describe("Repo-relative file path, e.g. 'rfcs/2022-04-09-accessibility.md'"),
});

export const ListDirectoryInputSchema = z.object({
  path: z.string().default("").describe("Repo-relative directory path; empty for root"),
});

export const CreateEdgeInputSchema = z.object({
  type: z.enum(["SUPERSEDES", "INFORMS"]),
  fromDecisionId: z.string().min(1),
  toDecisionId: z.string().min(1),
  rationale: z.string().min(20).describe("Why this relationship holds, citing the decisions' own evidence"),
});

/* ------------------------------------------------------------------ */
/* Run log events                                                      */
/* ------------------------------------------------------------------ */

export const RunEventSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("run_started"), runId: z.string(), component: z.string(), model: z.string(), ts: z.string() }),
  /** Coarse lifecycle marker (planning, searching, synthesizing) for UI grouping. */
  z.object({ t: z.literal("phase"), name: z.string(), ts: z.string() }),
  z.object({ t: z.literal("tool_call"), seq: z.number(), name: z.string(), input: z.unknown(), ts: z.string() }),
  z.object({ t: z.literal("tool_result"), seq: z.number(), summary: z.string(), bytes: z.number(), isError: z.boolean(), ts: z.string() }),
  z.object({ t: z.literal("guard_hit"), path: z.string(), ts: z.string() }),
  z.object({ t: z.literal("decision_emitted"), decisionId: z.string(), title: z.string(), confidence: ConfidenceSchema, ts: z.string() }),
  z.object({ t: z.literal("decision_rejected"), errors: z.array(z.string()), ts: z.string() }),
  z.object({ t: z.literal("assistant_text"), text: z.string(), ts: z.string() }),
  z.object({ t: z.literal("run_finished"), status: z.enum(["completed", "truncated", "failed"]), stats: z.record(z.unknown()), ts: z.string() }),
]);

/* ------------------------------------------------------------------ */
/* Validation report                                                   */
/* ------------------------------------------------------------------ */

export const ValidationMatchSchema = z.object({
  extractedId: z.string(),
  groundTruthRef: z.string(),
  judgeRationale: z.string(),
  overlap: z.enum(["full", "partial"]),
});

export const ValidationReportSchema = z.object({
  component: z.string(),
  matched: z.array(ValidationMatchSchema),
  missed: z.array(z.object({ groundTruthRef: z.string(), summary: z.string() })),
  novel: z.array(z.object({ extractedId: z.string(), title: z.string(), confidence: ConfidenceSchema })),
  excerptIntegrity: z.object({
    checked: z.number(),
    verified: z.number(),
    unverified: z.array(z.object({ decisionId: z.string(), evidenceId: z.string() })),
  }),
  confidenceCalibration: z.record(
    z.object({ total: z.number(), matched: z.number() })
  ),
  generatedAt: z.string(),
});
