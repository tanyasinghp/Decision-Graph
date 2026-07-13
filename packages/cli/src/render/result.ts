/** Shared status → exit-code + human/JSON result rendering for commands. */

import type { Ctx } from "../context.js";
import { fail, jsonOut, warn } from "./output.js";

export interface CommonResult {
  status: string;
  error?: { message: string };
  runId?: string;
}

export function statusExit(status: string): number {
  return status === "completed" ? 0 : status === "truncated" ? 4 : 1;
}

export function renderResult(
  ctx: Ctx,
  command: string,
  result: CommonResult,
  human: () => void,
  jsonData: () => Record<string, unknown> = () => ({})
): number {
  if (ctx.json) {
    jsonOut(ctx.io, { command, status: result.status, ...(result.error ? { error: result.error } : {}), ...jsonData() });
  } else if (result.status === "completed") {
    human();
  } else if (result.status === "truncated") {
    warn(
      ctx.io,
      ctx.s,
      `Cancelled — progress was checkpointed. Resume with: ${ctx.s.bold(`dg ${command}${result.runId ? " --resume --run " + result.runId : " --resume"}`)}`
    );
  } else {
    fail(ctx.io, ctx.s, `Failed${result.error ? ": " + result.error.message : ""}`);
  }
  return statusExit(result.status);
}
