/** Typed CLI errors so the dispatcher can render them with the right tone + exit code. */

export type CliErrorKind = "usage" | "auth" | "connector" | "workspace" | "engine";

export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
    readonly kind: CliErrorKind = "engine"
  ) {
    super(message);
    this.name = "CliError";
  }
}

export class UsageError extends CliError {
  constructor(message: string) {
    super(message, 2, "usage");
    this.name = "UsageError";
  }
}
