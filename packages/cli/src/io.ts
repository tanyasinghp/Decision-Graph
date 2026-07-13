/**
 * IO — the CLI's window on the outside world.
 *
 * Everything the CLI writes or reads goes through this interface so tests can
 * capture output, force non-TTY, disable color, and script stdin deterministically.
 */

export interface IO {
  stdout(s: string): void;
  stderr(s: string): void;
  readonly isTTY: boolean;
  readonly color: boolean;
  readonly cwd: string;
  readonly env: Record<string, string | undefined>;
  /** Read a single line (interactive prompts). */
  readLine(prompt: string): Promise<string>;
}

export interface DefaultIOOptions {
  color?: boolean;
  cwd?: string;
}

export function defaultIO(opts: DefaultIOOptions = {}): IO {
  const isTTY = Boolean(process.stdout.isTTY);
  const color = opts.color ?? (isTTY && process.env.NO_COLOR === undefined);
  return {
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
    isTTY,
    color,
    cwd: opts.cwd ?? process.cwd(),
    env: process.env,
    async readLine(prompt: string): Promise<string> {
      const readline = await import("node:readline/promises");
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      try {
        return (await rl.question(prompt)).trim();
      } finally {
        rl.close();
      }
    },
  };
}

/* ------------------------------- styling -------------------------------- */

const CODES = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m",
  blue: "\x1b[34m", magenta: "\x1b[35m", cyan: "\x1b[36m", gray: "\x1b[90m",
} as const;

export function styler(color: boolean) {
  const wrap = (code: string) => (s: string | number) => (color ? `${code}${s}${CODES.reset}` : String(s));
  return {
    bold: wrap(CODES.bold), dim: wrap(CODES.dim),
    red: wrap(CODES.red), green: wrap(CODES.green), yellow: wrap(CODES.yellow),
    blue: wrap(CODES.blue), magenta: wrap(CODES.magenta), cyan: wrap(CODES.cyan), gray: wrap(CODES.gray),
  };
}

export type Styler = ReturnType<typeof styler>;

export const SYM = {
  ok: "✓", fail: "✗", warn: "!", info: "•", bullet: "›", arrow: "→",
} as const;
