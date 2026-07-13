/**
 * scripts/ask.ts — thin wrapper over engine.ask().
 * Usage: npm run ask -- --repo razorpay/blade --question "Why is Dropdown controlled-only?"
 */

import { parseArgs, requireFlag } from "./lib/cli.js";
import { platform } from "./lib/platform.js";

async function main(): Promise<void> {
  const { flags } = parseArgs(process.argv.slice(2));
  const repo = requireFlag(flags, "repo");
  const question = requireFlag(flags, "question");
  const { engine, workspace } = await platform(repo, { model: flags.get("model")?.[0] });

  const r = await engine.ask({ workspace, question });
  if (r.status !== "completed" || !r.answer) {
    console.error(`[ask] ${r.status}${r.error ? ": " + r.error.message : ""}`);
    process.exit(1);
  }

  const a = r.answer;
  console.log(`\nQuestion: ${question}`);
  console.log(`↓ intent: ${r.reasoning?.intent} (rule: ${r.reasoning?.matchedRule})`);
  console.log(`↓ evidence nodes: ${r.evidence?.join(", ") || "(none)"}`);
  console.log(`↓ supporting decisions: ${a.supportingDecisionIds.join(", ") || "(none)"}`);
  console.log(`↓ certainty: ${a.certainty}`);
  console.log(`\nAnswer: ${a.answer}\n`);
}

main().catch((e) => {
  console.error(`[ask] FAILED: ${(e as Error).message}`);
  process.exit(1);
});
