/** Minimal logger port. Surfaces inject their own; the engine defaults to silent. */
export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export const silentLogger: Logger = {
  info() {},
  warn() {},
  error() {},
};
