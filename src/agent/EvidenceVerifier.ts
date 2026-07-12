/**
 * agent/EvidenceVerifier.ts — mechanical faithfulness check for citations.
 *
 * ARCHITECTURAL DECISION: hallucinated quotes are caught by STRING
 * CONTAINMENT, not by another LLM call. When emit_decision arrives, each
 * evidence excerpt must literally appear (whitespace/case-normalized) in the
 * cached source its URL points to. Cheap, deterministic, and impossible to
 * sweet-talk. Combined with the Zod gate this means a fabricated citation
 * cannot enter the graph at all — the emission is rejected and the rejection
 * reason goes back to the model, which must re-quote verbatim.
 *
 * Resolution is URL-based (not evidence-id-based) because URLs are already
 * required by schema to be real github.com links — the same string a human
 * clicks in the demo is the string we verify against.
 */

import type { EvidenceRepository } from "../evidence/EvidenceRepository.js";
import type { Evidence } from "../domain/types.js";

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export interface VerificationFailure {
  evidenceId: string;
  reason: string;
}

export class EvidenceVerifier {
  constructor(private readonly evidence: EvidenceRepository) {}

  /** Returns the full searchable text of the artifact a URL points to. */
  private async sourceTextFor(url: string): Promise<string | undefined> {
    const pull = url.match(/\/pull\/(\d+)/);
    if (pull?.[1]) {
      const pr = await this.evidence.getPR(Number(pull[1]));
      return [
        pr.title,
        pr.body,
        ...pr.comments.map((c) => c.body),
        ...pr.reviewComments.map((c) => c.body),
      ].join("\n");
    }
    const issue = url.match(/\/issues\/(\d+)/);
    if (issue?.[1]) {
      const it = await this.evidence.getIssue(Number(issue[1]));
      return [it.title, it.body, ...it.comments.map((c) => c.body)].join("\n");
    }
    const commit = url.match(/\/commit\/([0-9a-f]{6,40})/);
    if (commit?.[1]) {
      return (await this.evidence.getCommit(commit[1])).message;
    }
    const blob = url.match(/\/blob\/[^/]+\/(.+)$/);
    if (blob?.[1]) {
      return (await this.evidence.getFile(decodeURIComponent(blob[1]))).content;
    }
    return undefined;
  }

  async verify(evidence: Evidence[]): Promise<VerificationFailure[]> {
    const failures: VerificationFailure[] = [];
    for (const ev of evidence) {
      let source: string | undefined;
      try {
        source = await this.sourceTextFor(ev.url);
      } catch {
        failures.push({
          evidenceId: ev.id,
          reason: `Source for ${ev.url} is not in the evidence cache. Cite only artifacts you actually read via tools.`,
        });
        continue;
      }
      if (source === undefined) {
        failures.push({
          evidenceId: ev.id,
          reason: `Cannot resolve ${ev.url} to a cached artifact (unsupported URL form).`,
        });
        continue;
      }
      if (!normalize(source).includes(normalize(ev.excerpt))) {
        failures.push({
          evidenceId: ev.id,
          reason:
            "Excerpt is not a verbatim quote from the cited source. Re-read the source and quote it exactly (you may shorten, but not paraphrase).",
        });
      }
    }
    return failures;
  }
}
