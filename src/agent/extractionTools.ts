/**
 * agent/extractionTools.ts — assembles the extraction toolset over a
 * ToolRuntime. This is glue: every tool delegates to EvidenceRepository or
 * the decision sink; no business logic lives here except result shaping.
 *
 * DECISIONS:
 *  - Tool results are TRUNCATED with explicit markers. Untruncated PR threads
 *    blow up the context window (risk #2 in the architecture doc); markers
 *    tell the model exactly how to get more (read_pr full:true) so truncation
 *    is a visible trade-off it can reason about, not silent data loss.
 *  - emit_decision performs the two-stage gate: Zod (structure) is done by
 *    the runtime; EvidenceVerifier (quote containment) runs here. Failures
 *    throw EvidenceGateError — recoverable — so the model gets the precise
 *    rejection reasons and self-corrects. This feedback loop is the module's
 *    core mechanism.
 *  - Decision ids are deterministic within a run (dec-<component>-<n>) so
 *    replays and tests are stable.
 */

import {
  CreateEdgeInputSchema,
  DecisionInputSchema,
  ListDirectoryInputSchema,
  ReadCommitInputSchema,
  ReadFileInputSchema,
  ReadIssueInputSchema,
  ReadPrInputSchema,
  SearchItemsInputSchema,
} from "../domain/schemas.js";
import { EvidenceGateError } from "../domain/errors.js";
import type { DecisionObject, RunEvent } from "../domain/types.js";
import type { EvidenceRepository } from "../evidence/EvidenceRepository.js";
import type { EvidenceVerifier } from "./EvidenceVerifier.js";
import type { ToolRuntime } from "./ToolRuntime.js";
import { now } from "./RunLog.js";

const CAPS = { body: 4000, comment: 1200, comments: 30, file: 20000 };

function cap(text: string, limit: number, hint: string): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n[...truncated — ${hint}]`;
}

export interface EmitContext {
  runId: string;
  model: string;
  component: string;
  getToolCallCount: () => number;
}

export function registerExtractionTools(opts: {
  runtime: ToolRuntime;
  evidence: EvidenceRepository;
  verifier: EvidenceVerifier;
  emitCtx: EmitContext;
  onDecision: (d: DecisionObject) => void;
  emitEvent: (e: RunEvent) => void;
}): void {
  const { runtime, evidence, verifier, emitCtx, onDecision, emitEvent } = opts;
  let decisionSeq = 0;

  runtime.register({
    name: "search_items",
    description:
      "Keyword-search cached issues, PRs and discussions (titles, bodies, comments). Returns ranked hits with snippets. Try multiple phrasings — synonyms, component aliases, error messages.",
    inputSchema: SearchItemsInputSchema,
    handler: async (input) => {
      // Zod defaults are applied at parse time but the inferred INPUT type
      // keeps them optional — normalize explicitly for the domain interface.
      const hits = await evidence.search({
        query: input.query,
        type: input.type ?? "any",
        limit: input.limit ?? 10,
      });
      if (hits.length === 0) return "No results. Try different or broader terms.";
      return hits
        .map((h) => `[${h.id}] ${h.title} (${h.date.slice(0, 10)}) score=${h.score}\n  ${h.url}\n  ${h.snippet.slice(0, 200)}`)
        .join("\n\n");
    },
  });

  runtime.register({
    name: "read_issue",
    description: "Read an issue's full body and comment thread from the evidence cache.",
    inputSchema: ReadIssueInputSchema,
    handler: async ({ number }) => {
      const it = await evidence.getIssue(number);
      const comments = it.comments
        .slice(0, CAPS.comments)
        .map((c) => `— ${c.author} (${c.createdAt.slice(0, 10)}):\n${cap(c.body, CAPS.comment, "quote what matters")}`)
        .join("\n\n");
      return [
        `# Issue #${it.number}: ${it.title}`,
        `state=${it.state} author=${it.author} created=${it.createdAt.slice(0, 10)} labels=[${it.labels.join(", ")}]`,
        it.url,
        cap(it.body, CAPS.body, "body truncated"),
        `## Comments (${it.comments.length})`,
        comments || "(none cached — this may be an unhydrated shell)",
      ].join("\n\n");
    },
  });

  runtime.register({
    name: "read_pr",
    description:
      "Read a pull request: body, discussion, review comments (where alternatives and pushback live), and files touched. Use full=true only if truncation hid something you need.",
    inputSchema: ReadPrInputSchema,
    handler: async ({ number, full }) => {
      const pr = await evidence.getPR(number);
      const capC = full ? Number.MAX_SAFE_INTEGER : CAPS.comment;
      const fmt = (cs: typeof pr.comments, label: string): string =>
        `## ${label} (${cs.length})\n\n` +
        cs.slice(0, full ? cs.length : CAPS.comments)
          .map((c) => `— ${c.author} (${c.createdAt.slice(0, 10)}):\n${cap(c.body, capC, "use full=true")}`)
          .join("\n\n");
      return [
        `# PR #${pr.number}: ${pr.title}`,
        `state=${pr.state} merged=${pr.merged} author=${pr.author} created=${pr.createdAt.slice(0, 10)}`,
        pr.url,
        cap(pr.body, full ? Number.MAX_SAFE_INTEGER : CAPS.body, "use full=true"),
        fmt(pr.comments, "Discussion"),
        fmt(pr.reviewComments, "Review comments"),
        `## Files touched (${pr.filesTouched.length})\n${pr.filesTouched.slice(0, 50).join("\n")}`,
      ].join("\n\n");
    },
  });

  runtime.register({
    name: "read_commit",
    description: "Read a commit message and metadata by SHA (short prefixes OK).",
    inputSchema: ReadCommitInputSchema,
    handler: async ({ sha }) => {
      const c = await evidence.getCommit(sha);
      return `commit ${c.sha}\nauthor=${c.author} date=${c.date}\n${c.url}\n\n${c.message}`;
    },
  });

  runtime.register({
    name: "read_file",
    description:
      "Read a repository file from the cache — RFCs (rfcs/), docs, READMEs. Design-stage reasoning often lives in RFCs.",
    inputSchema: ReadFileInputSchema,
    handler: async ({ path }) => {
      const f = await evidence.getFile(path); // guards enforced inside
      return `# ${f.path}\n${f.url}\n\n${cap(f.content, CAPS.file, "file truncated")}`;
    },
  });

  runtime.register({
    name: "list_directory",
    description: "List entries of a repository directory (empty path = root).",
    inputSchema: ListDirectoryInputSchema,
    handler: async ({ path }) => {
      const entries = await evidence.listDirectory(path ?? "");
      if (entries.length === 0) return `(empty or unknown directory: ${path || "/"})`;
      return entries.map((e) => `${e.type === "dir" ? "d" : "f"} ${e.path}`).join("\n");
    },
  });

  runtime.register({
    name: "emit_decision",
    description:
      "Record ONE reconstructed decision. Requires: at least one evidence item whose excerpt is a VERBATIM quote from a source you read; a justified confidence grade; observedOutcome null if no follow-up evidence exists. Rejections explain exactly what to fix.",
    inputSchema: DecisionInputSchema,
    handler: async (input) => {
      // Stage 2 gate: mechanical quote verification (stage 1 = Zod, in runtime).
      const failures = await verifier.verify(input.evidence);
      if (failures.length > 0) {
        emitEvent({ t: "decision_rejected", errors: failures.map((f) => `${f.evidenceId}: ${f.reason}`), ts: now() });
        throw new EvidenceGateError(failures.map((f) => `[${f.evidenceId}] ${f.reason}`));
      }

      decisionSeq++;
      const decision: DecisionObject = {
        ...input,
        id: `dec-${emitCtx.component.toLowerCase()}-${decisionSeq}`,
        extraction: {
          runId: emitCtx.runId,
          model: emitCtx.model,
          toolCalls: emitCtx.getToolCallCount(),
          ts: now(),
        },
      };
      onDecision(decision);
      emitEvent({ t: "decision_emitted", decisionId: decision.id, title: decision.title, confidence: decision.confidence, ts: now() });
      return JSON.stringify({ accepted: true, decisionId: decision.id });
    },
  });
}

/**
 * The linking toolset (LinkingAgent, Module 4) registers create_edge over the
 * same runtime. Schema exported from domain; wiring lands with the graph
 * layer so edges are validated against real stored decisions.
 */
export { CreateEdgeInputSchema };
