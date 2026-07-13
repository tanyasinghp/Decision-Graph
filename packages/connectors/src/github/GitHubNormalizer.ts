/**
 * GitHubNormalizer — ConnectorArtifact → canonical EvidenceObject.
 *
 * GitHubFetcher already emits domain shapes (IssueThread/PrThread/CommitInfo),
 * so normalization here is mostly stamping Provenance{ source:"github", … }.
 * The value of the seam is uniformity: a future SlackNormalizer produces the
 * exact same EvidenceObject union from a very different raw shape, so the
 * reasoning engine never learns where evidence originated.
 */

import type {
  ConnectorArtifact,
  EvidenceObject,
  Normalizer,
} from "@dg/core/connector/types.js";
import type { CommitInfo, IssueThread, PrThread } from "@dg/domain/types.js";

export class GitHubNormalizer implements Normalizer {
  private prov(url?: string): EvidenceObject["provenance"] {
    return { source: "github", origin: "connector:github", ...(url ? { url } : {}) };
  }

  normalize(a: ConnectorArtifact): EvidenceObject {
    switch (a.kind) {
      case "issue": {
        const data = a.raw as IssueThread;
        return { kind: "issue", data, provenance: this.prov(a.url ?? data.url) };
      }
      case "pull_request": {
        const data = a.raw as PrThread;
        return { kind: "pull_request", data, provenance: this.prov(a.url ?? data.url) };
      }
      case "commit": {
        const data = a.raw as CommitInfo;
        return { kind: "commit", data, provenance: this.prov(a.url ?? data.url) };
      }
      case "file": {
        const raw = a.raw as { path: string; content: string };
        return { kind: "file", path: raw.path, content: raw.content, provenance: this.prov(a.url) };
      }
      default:
        throw new Error(`GitHubNormalizer: unsupported artifact kind "${a.kind}"`);
    }
  }
}
