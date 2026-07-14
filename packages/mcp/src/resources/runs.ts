/**
 * decisiongraph://runs — recent workflow runs (id, workflow, status, timestamp).
 * Read-only, via Workspace → runStore().list() (checkpoints). No filesystem access.
 */

import { currentWorkspace, type ResourceHandler } from "./types.js";

export const URI_RUNS = "decisiongraph://runs";

const RECENT_LIMIT = 20;

export const resRuns: ResourceHandler = async (inv) => {
  const ws = await currentWorkspace(inv);
  const all = ws ? ws.runStore().list() : [];

  const runs = [...all]
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, RECENT_LIMIT)
    .map((c) => ({ runId: c.runId, workflow: c.workflow, status: c.status, updatedAt: c.updatedAt }));

  return { uri: URI_RUNS, contents: { count: all.length, runs } };
};
