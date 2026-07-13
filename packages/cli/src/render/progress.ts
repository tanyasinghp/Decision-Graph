/**
 * Progress rendering — the CLI is only a sink for WorkflowEvents.
 *
 * TTY mode: a live spinner for the running step, committed ✓ lines for finished
 * steps and connector sub-progress, phase/decision breadcrumbs. It never polls
 * and never duplicates a line.
 *
 * JSON mode (--json): events are streamed as JSONL to stderr so stdout stays a
 * clean, parseable final result.
 */

import type { EventSink, WorkflowEvent } from "@dg/core";
import { SYM, styler, type IO, type Styler } from "../io.js";

const CONNECTOR_LABEL: Record<string, string> = {
  issues: "Reading Issues",
  pull_requests: "Reading Pull Requests",
  commits: "Reading Commits",
};

const fmtMs = (ms: number): string => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

class Spinner {
  private timer: ReturnType<typeof setInterval> | undefined;
  private i = 0;
  private label = "";
  private readonly frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  constructor(private readonly io: IO, private readonly s: Styler) {}
  start(label: string): void {
    this.label = label;
    if (!this.io.isTTY) return;
    this.tick();
    this.timer = setInterval(() => this.tick(), 80);
    (this.timer as { unref?: () => void }).unref?.();
  }
  private tick(): void {
    this.io.stdout(`\r\x1b[2K  ${this.s.cyan(this.frames[this.i++ % this.frames.length]!)} ${this.label}`);
  }
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    if (this.io.isTTY) this.io.stdout("\r\x1b[2K");
  }
}

export class ProgressReporter {
  readonly sink: EventSink = (e) => this.onEvent(e);
  private readonly spinner: Spinner;
  private readonly s: Styler;
  private currentStep: string | undefined;

  constructor(private readonly io: IO, private readonly json: boolean) {
    this.s = styler(io.color);
    this.spinner = new Spinner(io, this.s);
  }

  private commit(line: string): void {
    this.spinner.stop();
    this.io.stdout(line);
    if (this.currentStep) this.spinner.start(this.currentStep);
  }

  private onEvent(e: WorkflowEvent): void {
    if (this.json) {
      this.io.stderr(JSON.stringify(e) + "\n");
      return;
    }
    const p = e.payload;
    if (p.kind === "lifecycle") {
      const l = p.lifecycle;
      if (l.kind === "step_started") {
        this.currentStep = l.title;
        this.spinner.start(l.title);
      } else if (l.kind === "step_finished") {
        const title = this.currentStep ?? l.step;
        this.currentStep = undefined;
        this.spinner.stop();
        const mark = l.ok ? this.s.green(SYM.ok) : this.s.red(SYM.fail);
        const dur = l.ok ? this.s.dim(` (${fmtMs(l.ms)})`) : "";
        this.io.stdout(`  ${mark} ${title}${dur}\n`);
      }
    } else if (p.kind === "connector") {
      const c = p.progress;
      const label = CONNECTOR_LABEL[c.message] ?? c.message;
      const count = c.total !== undefined ? this.s.dim(` (${c.current}/${c.total})`) : "";
      this.commit(`  ${this.s.green(SYM.ok)} ${label}${count}\n`);
    } else if (p.kind === "run_event") {
      const ev = p.event;
      if (ev.t === "phase") this.commit(`  ${this.s.cyan(SYM.bullet)} ${cap(ev.name)}\n`);
      else if (ev.t === "decision_emitted")
        this.commit(`    ${this.s.magenta("★")} ${ev.title} ${this.s.dim(`[${ev.confidence}]`)}\n`);
    }
  }

  finish(): void {
    this.spinner.stop();
  }
}
