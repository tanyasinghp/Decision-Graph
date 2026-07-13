/**
 * Deterministic hashing + run-id helpers.
 *
 * `hashOf` gives a stable content hash (keys sorted) used to (a) detect that a
 * resume targets the same input and (b) fingerprint step outputs. Determinism
 * matters: the same run replays and resumes identically.
 */

import * as crypto from "node:crypto";

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) out[k] = normalize(src[k]);
    return out;
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(normalize(value)) ?? "null";
}

export function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export function hashOf(value: unknown): string {
  return sha256(stableStringify(value));
}

export function genRunId(workflow: string): string {
  return `${workflow}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
}
