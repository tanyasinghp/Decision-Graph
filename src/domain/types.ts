/**
 * domain/types.ts — inferred TS types + cache/evidence shapes.
 *
 * DECISION: cache file shapes (IssueThread, PrThread, ...) live in domain
 * because both the fetcher (writes) and the evidence source (reads) depend on
 * them; putting them in either module would create a sideways import.
 */

import type { z } from "zod";
import type {
  AlternativeSchema,
  ConfidenceSchema,
  CreateEdgeInputSchema,
  DecisionInputSchema,
  DecisionObjectSchema,
  EvidenceKindSchema,
  EvidenceSchema,
  RunEventSchema,
  SearchItemsInputSchema,
  ValidationReportSchema,
} from "./schemas.js";

export type EvidenceKind = z.infer<typeof EvidenceKindSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type Alternative = z.infer<typeof AlternativeSchema>;
export type Confidence = z.infer<typeof ConfidenceSchema>;
export type DecisionInput = z.infer<typeof DecisionInputSchema>;
export type DecisionObject = z.infer<typeof DecisionObjectSchema>;

// Graph types (GraphNode, GraphEdge, NodeType, EdgeType, ...) are exported
// from domain/graph.ts alongside their schemas and endpoint rules.

export type SearchItemsInput = z.infer<typeof SearchItemsInputSchema>;
export type CreateEdgeInput = z.infer<typeof CreateEdgeInputSchema>;
export type RunEvent = z.infer<typeof RunEventSchema>;
export type ValidationReport = z.infer<typeof ValidationReportSchema>;

/* ------------------------------------------------------------------ */
/* Evidence cache shapes (what prefetch writes, what tools read)       */
/* ------------------------------------------------------------------ */

export interface CachedComment {
  author: string;
  body: string;
  createdAt: string;
  url: string;
}

export interface IssueThread {
  number: number;
  title: string;
  state: string;
  author: string;
  body: string;
  url: string;
  createdAt: string;
  closedAt: string | null;
  labels: string[];
  comments: CachedComment[];
}

export interface PrThread extends IssueThread {
  merged: boolean;
  mergedAt: string | null;
  /** Review comments are where dissent and alternatives live. */
  reviewComments: CachedComment[];
  filesTouched: string[];
}

export interface CommitInfo {
  sha: string;
  author: string;
  date: string;
  message: string;
  url: string;
  filesTouched: string[];
}

export interface FileContent {
  path: string;
  content: string;
  url: string;
}

export interface DirEntry {
  name: string;
  path: string;
  type: "file" | "dir";
}

export interface SearchHit {
  id: string;
  kind: "pr" | "issue" | "discussion";
  number: number;
  title: string;
  date: string;
  url: string;
  snippet: string;
  score: number;
}

export interface SearchQuery {
  query: string;
  type: "pr" | "issue" | "discussion" | "any";
  limit: number;
}

/* ------------------------------------------------------------------ */
/* Results                                                             */
/* ------------------------------------------------------------------ */

export interface RunStats {
  toolCalls: number;
  guardHits: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
}

export interface ExtractionResult {
  runId: string;
  component: string;
  decisions: DecisionObject[];
  stats: RunStats;
  status: "completed" | "truncated" | "failed";
}
