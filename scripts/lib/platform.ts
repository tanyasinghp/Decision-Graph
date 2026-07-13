/**
 * scripts/lib/platform.ts — the one place a script builds the platform.
 *
 * Every script now: parse args → build workspace+engine here → call one public
 * DecisionGraphEngine API → print. No business logic lives in scripts anymore.
 */

import {
  ConnectorRegistry,
  DecisionGraphEngine,
  type EventSink,
  type WorkflowEvent,
  type Workspace,
} from "@dg/core";
import { GitHubConnector } from "@dg/connectors";
import { LocalWorkspaceProvider } from "@dg/workspace-local";
import { DATA_DIR } from "./cli.js";

export interface PlatformOverrides {
  model?: string;
  promptVersion?: string;
  toolBudget?: number;
}

export async function platform(
  repo: string,
  overrides: PlatformOverrides = {}
): Promise<{ engine: DecisionGraphEngine; workspace: Workspace }> {
  const registry = new ConnectorRegistry().register(new GitHubConnector());
  const provider = new LocalWorkspaceProvider({ dataDir: DATA_DIR, registry, defaults: overrides });
  const workspace = await provider.resolve(repo);
  // Flag overrides win for this run (not persisted to config.json).
  if (overrides.model) workspace.config.model = overrides.model;
  if (overrides.promptVersion) workspace.config.promptVersion = overrides.promptVersion;
  if (overrides.toolBudget !== undefined) workspace.config.toolBudget = overrides.toolBudget;
  return { engine: new DecisionGraphEngine(), workspace };
}

/** SIGINT → cancel the current run cleanly (the run becomes resumable). */
export function cancelOnSigint(label: string): AbortController {
  const ac = new AbortController();
  process.on("SIGINT", () => {
    console.log(`\n[${label}] cancelling…`);
    ac.abort();
  });
  return ac;
}

/** Console progress printer — a plain WorkflowEvent subscriber. */
export function consoleSink(): EventSink {
  return (e: WorkflowEvent) => {
    const p = e.payload;
    if (p.kind === "lifecycle") {
      const l = p.lifecycle;
      if (l.kind === "step_started") console.log(`\n▶ ${l.title}`);
      else if (l.kind === "step_finished" && !l.ok) console.log(`  ✗ step failed`);
      else if (l.kind === "run_cancelled") console.log(`  ⓧ cancelled (resumable)`);
      else if (l.kind === "run_failed") console.log(`  ✗ ${l.message}`);
    } else if (p.kind === "connector") {
      const c = p.progress;
      console.log(`  … ${c.source}: ${c.message}${c.total ? ` (${c.current}/${c.total})` : ""}`);
    } else if (p.kind === "run_event") {
      const ev = p.event;
      if (ev.t === "phase") console.log(`  == ${ev.name.toUpperCase()} ==`);
      else if (ev.t === "tool_call") console.log(`    → ${ev.name}`);
      else if (ev.t === "decision_emitted") console.log(`    ★ ${ev.decisionId} [${ev.confidence}] ${ev.title}`);
      else if (ev.t === "decision_rejected") console.log(`    ✗ decision rejected`);
    }
  };
}
