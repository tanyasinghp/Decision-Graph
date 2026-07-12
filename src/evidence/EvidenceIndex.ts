/**
 * evidence/EvidenceIndex.ts — in-memory keyword search over cached items.
 *
 * ARCHITECTURAL DECISION: deliberate keyword search, NOT embeddings.
 *  - Deterministic: same query → same ranking, every run. (Embedding
 *    similarity + ANN indexes reintroduce nondeterminism and a dependency.)
 *  - Debuggable: a ranking is explainable by pointing at term hits.
 *  - Sufficient: the agent iterates on queries itself; recall gaps are
 *    covered by Claude trying synonyms, which the run log makes visible.
 * Embeddings are a Phase-2+ swap behind the same search() signature if
 * keyword recall proves limiting on real data.
 *
 * Scoring: title hits weigh 5, body 2, comments 1; all-terms-in-title bonus.
 * Simple, monotonic, and tested — resist the urge to make this clever.
 */

import type { IssueThread, PrThread, SearchHit, SearchQuery } from "../domain/types.js";

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}

interface IndexedItem {
  kind: "issue" | "pr";
  number: number;
  title: string;
  date: string;
  url: string;
  titleTokens: Set<string>;
  bodyTokens: Set<string>;
  commentTokens: Set<string>;
  snippetSource: string;
}

export class EvidenceIndex {
  private items: IndexedItem[] = [];

  constructor(issues: Record<string, IssueThread>, prs: Record<string, PrThread>) {
    for (const it of Object.values(issues)) this.items.push(this.indexItem(it, "issue"));
    for (const it of Object.values(prs)) this.items.push(this.indexItem(it, "pr"));
  }

  private indexItem(it: IssueThread, kind: "issue" | "pr"): IndexedItem {
    const commentText = it.comments.map((c) => c.body).join(" ");
    return {
      kind,
      number: it.number,
      title: it.title,
      date: it.createdAt,
      url: it.url,
      titleTokens: new Set(tokenize(it.title)),
      bodyTokens: new Set(tokenize(it.body)),
      commentTokens: new Set(tokenize(commentText)),
      snippetSource: (it.body || commentText).slice(0, 400),
    };
  }

  search(q: SearchQuery): SearchHit[] {
    const terms = tokenize(q.query);
    if (terms.length === 0) return [];

    const hits: SearchHit[] = [];
    for (const item of this.items) {
      if (q.type !== "any" && item.kind !== q.type) continue;

      let score = 0;
      let titleHits = 0;
      for (const t of terms) {
        if (item.titleTokens.has(t)) { score += 5; titleHits++; }
        if (item.bodyTokens.has(t)) score += 2;
        if (item.commentTokens.has(t)) score += 1;
      }
      if (titleHits === terms.length && terms.length > 1) score += 5;
      if (score === 0) continue;

      hits.push({
        id: `${item.kind}-${item.number}`,
        kind: item.kind,
        number: item.number,
        title: item.title,
        date: item.date,
        url: item.url,
        snippet: item.snippetSource,
        score,
      });
    }

    // Deterministic ordering: score desc, then number desc (newer first-ish),
    // so equal-score ties never reorder between runs.
    hits.sort((a, b) => b.score - a.score || b.number - a.number);
    return hits.slice(0, q.limit);
  }
}
