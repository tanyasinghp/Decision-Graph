/**
 * scripts/lib/cli.ts — tiny arg parser + env loading shared by all scripts.
 * DECISION: no commander/yargs dependency — six flags don't justify one.
 */

import "dotenv/config";
import { ConfigError } from "@dg/domain/errors.js";

export function parseArgs(argv: string[]): { flags: Map<string, string[]>; bools: Set<string> } {
  const flags = new Map<string, string[]>();
  const bools = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a?.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      bools.add(key);
    } else {
      const list = flags.get(key) ?? [];
      list.push(next);
      flags.set(key, list);
      i++;
    }
  }
  return { flags, bools };
}

export function requireFlag(flags: Map<string, string[]>, name: string): string {
  const v = flags.get(name)?.[0];
  if (!v) throw new ConfigError(`Missing required flag: --${name}`);
  return v;
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new ConfigError(`Missing env var ${name} (see .env.example)`);
  return v;
}

export const DATA_DIR = new URL("../../data/", import.meta.url).pathname;
