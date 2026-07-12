/**
 * scripts/ask.ts — ask the Decision Graph a question.
 * Usage: npm run ask -- --repo razorpay/blade --question "Why is Dropdown controlled-only?"
 */

import { JsonGraphStore } from "../src/graph/GraphStore.js";
import { QueryEngine } from "../src/query/QueryEngine.js";
import { AnthropicClient } from "../src/llm/AnthropicClient.js";
import { DATA_DIR, parseArgs, requireEnv, requireFlag } from "./lib/cli.js";

async function main(): Promise<void> {
  const { flags } = parseArgs(process.argv.slice(2));
  const repo = requireFlag(flags, "repo");
  const question = requireFlag(flags, "question");
  const model = flags.get("model")?.[0] ?? process.env.DG_MODEL ?? "claude-sonnet-4-5";

  const engine = new QueryEngine(
    new AnthropicClient(requireEnv("ANTHROPIC_API_KEY"), model),
    new JsonGraphStore(DATA_DIR, repo),
    repo
  );

  const result = await engine.answerQuestion(question);
  console.log("\n" + engine.traceReasoning(result) + "\n");
}

main().catch((e) => {
  console.error(`[ask] FAILED: ${(e as Error).message}`);
  process.exit(1);
});
