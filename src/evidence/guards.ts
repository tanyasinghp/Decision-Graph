/**
 * evidence/guards.ts — the ground-truth holdout, enforced in code.
 *
 * ARCHITECTURAL DECISION: the `_decisions` deny-list lives in ONE tested
 * choke point, called by every path-touching operation in the evidence layer.
 * We deliberately do NOT rely on the system prompt to keep the agent out of
 * ground truth — prompts are suggestions; this is a wall.
 *
 * Enforcement is double:
 *   1. WRITE time: the prefetch fetcher skips deny-listed paths, so ground
 *      truth never even enters data/cache. (See GitHubFetcher/prefetch.)
 *   2. READ time: CachedEvidenceRepository calls assertAllowedPath on every
 *      file/directory access, so even a corrupted cache can't leak.
 *
 * Matching is segment-based, not substring-based: "docs/decisions-faq.md"
 * must remain readable while "packages/x/_decisions/api.md" must not.
 */

import { ForbiddenPathError } from "../domain/errors.js";

const DEFAULT_DENY_SEGMENTS = ["_decisions"];

/** Normalize a repo-relative path into clean, comparable segments. */
function segmentsOf(p: string): string[] {
  return p
    .replace(/\\/g, "/")
    .split("/")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0 && s !== ".");
}

export function isForbiddenPath(path: string, extraDenySegments: string[] = []): boolean {
  const deny = new Set(
    [...DEFAULT_DENY_SEGMENTS, ...extraDenySegments].map((s) => s.toLowerCase())
  );
  return segmentsOf(path).some((seg) => deny.has(seg));
}

/** Throws ForbiddenPathError (recoverable → surfaced to Claude as a tool error). */
export function assertAllowedPath(path: string, extraDenySegments: string[] = []): void {
  if (isForbiddenPath(path, extraDenySegments)) {
    throw new ForbiddenPathError(path);
  }
}
