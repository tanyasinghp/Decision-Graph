/**
 * decisiongraph://decisions — decision count, latest decisions, and confidence
 * distribution. Metadata only; the full graph is NOT exposed. Read-only, via
 * Workspace → stores() → decisions().
 */

import { currentWorkspace, type ResourceHandler } from "./types.js";

export const URI_DECISIONS = "decisiongraph://decisions";

export const resDecisions: ResourceHandler = async (inv) => {
  const ws = await currentWorkspace(inv);
  if (!ws) {
    return { uri: URI_DECISIONS, contents: { count: 0, latest: [], confidence: { high: 0, medium: 0, low: 0 } } };
  }

  const decisions = ws.stores().decisions().loadAll(ws.config.promptVersion);

  const confidence: Record<string, number> = { high: 0, medium: 0, low: 0 };
  for (const d of decisions) confidence[d.confidence] = (confidence[d.confidence] ?? 0) + 1;

  const key = (d: (typeof decisions)[number]): string => String(d.decidedAt ?? d.extraction?.ts ?? "");
  const latest = [...decisions]
    .sort((a, b) => key(b).localeCompare(key(a)))
    .slice(0, 5)
    .map((d) => ({ id: d.id, title: d.title, confidence: d.confidence, decidedAt: d.decidedAt ?? null }));

  return { uri: URI_DECISIONS, contents: { count: decisions.length, latest, confidence } };
};
