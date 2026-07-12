/**
 * scripts/replay.ts — replay a recorded extraction run WITHOUT any model call.
 *
 * Usage: tsx scripts/replay.ts --run <runId> [--speed 20]
 *
 * Proof-of-concept for the deterministic demo path: the Phase 2 UI trace
 * panel consumes exactly this event stream over SSE. --speed controls
 * playback pacing (events/second); 0 = instant dump.
 */

import * as path from "node:path";
import { RunLog } from "../src/agent/RunLog.js";
import { DATA_DIR, parseArgs, requireFlag } from "./lib/cli.js";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const { flags } = parseArgs(process.argv.slice(2));
  const runId = requireFlag(flags, "run");
  const speed = Number(flags.get("speed")?.[0] ?? 20);

  const events = RunLog.read(path.join(DATA_DIR, "runs"), runId);
  console.log(`[replay] ${runId}: ${events.length} events\n`);

  for (const e of events) {
    switch (e.t) {
      case "run_started": console.log(`▶ run ${e.runId} (${e.model})`); break;
      case "phase": console.log(`\n== ${e.name.toUpperCase()} ==`); break;
      case "assistant_text": console.log(`\n💭 ${e.text.slice(0, 200)}${e.text.length > 200 ? "…" : ""}`); break;
      case "tool_call": console.log(`  → ${e.name} ${JSON.stringify(e.input).slice(0, 110)}`); break;
      case "tool_result": console.log(`    ${e.isError ? "✗" : "✓"} ${e.summary.slice(0, 90).replace(/\n/g, " ")}`); break;
      case "guard_hit": console.log(`  🛡 guard blocked: ${e.path}`); break;
      case "decision_emitted": console.log(`  ★ ${e.decisionId} [${e.confidence}] ${e.title}`); break;
      case "decision_rejected": console.log(`  ✗ rejected: ${e.errors[0]?.slice(0, 90)}`); break;
      case "run_finished": console.log(`\n■ ${e.status} — ${JSON.stringify(e.stats)}`); break;
    }
    if (speed > 0) await sleep(1000 / speed);
  }
}

main().catch((e) => {
  console.error(`[replay] FAILED: ${(e as Error).message}`);
  process.exit(1);
});
