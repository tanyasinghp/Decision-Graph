/**
 * agent/prompts.ts — prompt loading. Prompts are CONFIGURATION.
 *
 * DECISION: prompts live in prompts/*.md, not in TypeScript strings, because
 * prompt iteration is the highest-leverage activity in this project (risk #1)
 * and it must not require touching code, passing review, or understanding
 * the runtime. Edit markdown → rerun. Templating is deliberately dumb
 * ({{var}} substitution only): logic in templates is logic you can't test.
 * Unreplaced variables throw — a half-rendered prompt silently degrades
 * extraction quality, which is the worst failure mode available here.
 */

import * as fs from "node:fs";
import { ConfigError } from "@dg/domain/errors.js";

const PROMPTS_DIR = new URL("../../../../prompts/", import.meta.url);

/**
 * Versioning: EXTRACTION prompts live in prompts/versions/<v>/ because they
 * are the experimental variable of the evaluation loop (Module 4). Judge and
 * query prompts stay unversioned at prompts/ root — the measuring stick must
 * not move while the thing being measured changes.
 */
export function loadPrompt(
  name: string,
  vars: Record<string, string>,
  opts?: { version?: string }
): string {
  const rel = opts?.version ? `versions/${opts.version}/${name}.md` : `${name}.md`;
  const file = new URL(rel, PROMPTS_DIR);
  if (!fs.existsSync(file)) throw new ConfigError(`Prompt file missing: prompts/${rel}`);
  let text = fs.readFileSync(file, "utf8");

  for (const [key, value] of Object.entries(vars)) {
    text = text.replaceAll(`{{${key}}}`, value);
  }

  const leftover = text.match(/\{\{([a-zA-Z_]+)\}\}/);
  if (leftover) throw new ConfigError(`Prompt ${name}.md has unbound variable: ${leftover[0]}`);
  return text;
}
