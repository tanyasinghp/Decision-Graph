/**
 * Result rendering helpers — small, dependency-free table/kv/section printers
 * shared by every command's human-readable output.
 */

import { SYM, type IO, type Styler } from "../io.js";

export function line(io: IO, text = ""): void {
  io.stdout(text + "\n");
}

export function heading(io: IO, s: Styler, text: string): void {
  io.stdout(`\n${s.bold(text)}\n`);
}

export function kv(io: IO, s: Styler, rows: Array<[string, string]>): void {
  const w = rows.reduce((m, [k]) => Math.max(m, k.length), 0);
  for (const [k, v] of rows) io.stdout(`  ${s.dim(k.padEnd(w))}   ${v}\n`);
}

export function table(io: IO, s: Styler, headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const fmt = (cells: string[]): string => cells.map((c, i) => c.padEnd(widths[i]!)).join("  ");
  io.stdout(`  ${s.bold(fmt(headers))}\n`);
  io.stdout(`  ${s.dim(widths.map((w) => "─".repeat(w)).join("  "))}\n`);
  for (const r of rows) io.stdout(`  ${fmt(r)}\n`);
}

export function ok(io: IO, s: Styler, text: string): void {
  io.stdout(`${s.green(SYM.ok)} ${text}\n`);
}

export function warn(io: IO, s: Styler, text: string): void {
  io.stdout(`${s.yellow(SYM.warn)} ${text}\n`);
}

export function fail(io: IO, s: Styler, text: string): void {
  io.stderr(`${s.red(SYM.fail)} ${text}\n`);
}

export function jsonOut(io: IO, data: unknown): void {
  io.stdout(JSON.stringify(data, null, 2) + "\n");
}
