/**
 * domain/errors.ts
 *
 * Typed error hierarchy for the whole system.
 *
 * ARCHITECTURAL DECISION: errors carry machine-readable `code` fields because
 * two very different consumers handle them:
 *   1. Humans debugging via run logs.
 *   2. The agent loop, which converts some of these (ForbiddenPathError,
 *      EvidenceGateError, CacheMissError) into *tool results* so Claude can
 *      self-correct mid-run instead of crashing the extraction.
 * The `recoverable` flag is what the loop uses to make that call.
 */

export abstract class DecisionGraphError extends Error {
  abstract readonly code: string;
  /** If true, the agent loop returns this to Claude as a tool error and continues. */
  abstract readonly recoverable: boolean;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * Thrown by the evidence layer when a tool touches a deny-listed path
 * (`_decisions/**`). Recoverable: Claude receives "this path is off-limits"
 * and moves on. Every occurrence is also logged as a `guard_hit` run event —
 * during the demo, guard hits are *proof* the holdout is enforced in code.
 */
export class ForbiddenPathError extends DecisionGraphError {
  readonly code = "FORBIDDEN_PATH";
  readonly recoverable = true;
  constructor(public readonly path: string) {
    super(`Path is not accessible during extraction: ${path}`);
  }
}

/** A requested item isn't in the local cache. Recoverable: Claude picks another lead. */
export class CacheMissError extends DecisionGraphError {
  readonly code = "CACHE_MISS";
  readonly recoverable = true;
  constructor(public readonly what: string) {
    super(`Not found in local evidence cache: ${what}`);
  }
}

/**
 * emit_decision payload failed schema validation (missing evidence, short
 * excerpts, bad URLs...). Recoverable BY DESIGN: the Zod issues are returned
 * verbatim as the tool result, and Claude retries with a corrected object.
 * This is the "faithfulness enforced by types, not prompts" mechanism.
 */
export class EvidenceGateError extends DecisionGraphError {
  readonly code = "EVIDENCE_GATE";
  readonly recoverable = true;
  constructor(public readonly issues: string[]) {
    super(`Decision rejected by evidence gate:\n- ${issues.join("\n- ")}`);
  }
}

/** Edge references a missing node or violates endpoint-kind rules. Not recoverable: indicates a bug. */
export class GraphIntegrityError extends DecisionGraphError {
  readonly code = "GRAPH_INTEGRITY";
  readonly recoverable = false;
}

/** Wraps Anthropic API failures that survived retries. Not recoverable within a run. */
export class LlmError extends DecisionGraphError {
  readonly code = "LLM";
  readonly recoverable = false;
}

/** Configuration/wiring problems (missing env vars, bad CLI args). Fail fast. */
export class ConfigError extends DecisionGraphError {
  readonly code = "CONFIG";
  readonly recoverable = false;
}
