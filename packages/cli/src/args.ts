/**
 * Minimal argv parser (no dependency). Supports `--flag value`, `--bool`, and
 * positionals. Kept deliberately small — the CLI's job is dispatch, not a DSL.
 */

export interface ParsedArgs {
  positionals: string[];
  flags: Map<string, string>;
  bools: Set<string>;
}

const KNOWN_BOOLS = new Set(["json", "no-color", "yes", "help", "version", "link", "no-link"]);

export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string>();
  const bools = new Set<string>();

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (KNOWN_BOOLS.has(key) || next === undefined || next.startsWith("--")) {
        bools.add(key);
      } else {
        flags.set(key, next);
        i++;
      }
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags, bools };
}

export function flag(a: ParsedArgs, name: string): string | undefined {
  return a.flags.get(name);
}
export function bool(a: ParsedArgs, name: string): boolean {
  return a.bools.has(name);
}
