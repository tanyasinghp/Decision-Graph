/**
 * LocalEvidenceStore — write port over the existing CacheStore.
 *
 * Dispatches canonical EvidenceObjects to CacheStore's existing merge/write
 * methods. Cache FORMATS are unchanged (issues.json, pull_requests.json,
 * commits.json, tree.json, files/…); the merge methods are already idempotent
 * and return new-key counts, which is exactly the incremental signal we report.
 */

import type { CacheStore } from "@dg/engine/evidence/CacheStore.js";
import type { CommitInfo, IssueThread, PrThread } from "@dg/domain/types.js";
import type { EvidenceObject, EvidenceStore, EvidenceWriteResult } from "@dg/core";

export class LocalEvidenceStore implements EvidenceStore {
  constructor(private readonly cache: CacheStore) {}

  write(objects: EvidenceObject[]): EvidenceWriteResult {
    const issues: IssueThread[] = [];
    const prs: PrThread[] = [];
    const commits: CommitInfo[] = [];
    let files = 0;
    let treeEntries = 0;

    for (const o of objects) {
      switch (o.kind) {
        case "issue":
          issues.push(o.data);
          break;
        case "pull_request":
          prs.push(o.data);
          break;
        case "commit":
          commits.push(o.data);
          break;
        case "file":
          this.cache.writeFile(o.path, o.content);
          files++;
          break;
        case "tree":
          this.cache.writeTree(o.entries);
          treeEntries += o.entries.length;
          break;
      }
    }

    const byKind: Record<string, number> = {};
    if (issues.length) byKind.issue = this.cache.mergeIssues(issues);
    if (prs.length) byKind.pull_request = this.cache.mergePrs(prs);
    if (commits.length) byKind.commit = this.cache.mergeCommits(commits);
    if (files) byKind.file = files;
    if (treeEntries) byKind.tree = treeEntries;

    const added = Object.values(byKind).reduce((a, b) => a + b, 0);
    return { added, total: objects.length, byKind };
  }
}
