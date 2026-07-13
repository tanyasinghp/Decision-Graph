/**
 * DecisionGraphEngine — the single public API for the whole platform.
 *
 * Every surface (CLI, MCP, REST, dashboard, VS Code) calls these high-level
 * methods; none of them orchestrate workflows by hand. Each method runs one or
 * more workflows through the WorkflowEngine and returns a structured result.
 * Progress (sinks), cancellation (signal), resume (ResumePolicy) and errors are
 * uniform across every method — they are the WorkflowEngine's event model,
 * surfaced unchanged.
 */

import { WorkflowEngine, type RunOptions, type WorkflowRunHandle } from "./workflow/WorkflowEngine.js";
import { WorkflowCatalog } from "./workflow/WorkflowCatalog.js";
import { defaultCatalog } from "./workflow/workflows/index.js";
import type { Workflow, WorkflowResult } from "./workflow/Workflow.js";
import type { EventSink } from "./events/WorkflowEvent.js";
import type { ResumePolicy } from "./checkpoint/Checkpoint.js";
import type { RunStore } from "./checkpoint/RunStore.js";
import type { Workspace } from "./workspace/Workspace.js";
import type { SyncScope } from "./connector/types.js";
import type { SourceSystem } from "@dg/domain/graph.js";
import type { Answer, AnsweredQuestion, ReasoningTrace } from "@dg/engine/query/QueryEngine.js";

import { ingestWorkflow, type IngestOutput } from "./workflow/workflows/ingest.js";
import { extractWorkflow, type ExtractOutput } from "./workflow/workflows/extract.js";
import { graphBuildWorkflow, type GraphBuildOutput } from "./workflow/workflows/graphBuild.js";
import { linkWorkflow, type LinkOutput } from "./workflow/workflows/link.js";
import { evaluateWorkflow, type EvaluateOutput } from "./workflow/workflows/evaluate.js";
import { queryWorkflow } from "./workflow/workflows/query.js";
import { replayWorkflow, type ReplayOutput } from "./workflow/workflows/replay.js";
import { exportWorkflow, type ExportFormat, type ExportOutput } from "./workflow/workflows/export.js";

/* ------------------------------- options ------------------------------- */

/** Common options every public method accepts. */
export interface EngineCallOptions {
  workspace: Workspace;
  /** Progress subscribers (renderer, SSE, MCP progress). */
  sinks?: EventSink[];
  /** Cooperative cancellation at step boundaries. */
  signal?: AbortSignal;
  /** Skip completed idempotent steps of a prior run. */
  resume?: ResumePolicy;
  runId?: string;
  runStore?: RunStore;
}

/* ------------------------------- results ------------------------------- */

export interface AskResult extends WorkflowResult<AnsweredQuestion> {
  answer?: Answer;
  reasoning?: ReasoningTrace;
  /** Node ids that formed the reasoning context (the "evidence"). */
  evidence?: string[];
}

export interface AnalyzeSummary {
  repo: string;
  nodes: number;
  edges: number;
  decisions: number;
}

export interface AnalyzeResult {
  status: "completed" | "truncated" | "failed";
  summary?: AnalyzeSummary;
  steps: {
    ingest?: WorkflowResult<IngestOutput>;
    extract?: WorkflowResult<ExtractOutput>;
    graph?: WorkflowResult<GraphBuildOutput>;
    link?: WorkflowResult<LinkOutput>;
  };
  error?: { message: string; stage: string };
  events: number;
}

export interface DecisionGraphEngineOptions {
  workflows?: WorkflowCatalog;
}

/* -------------------------------- facade ------------------------------- */

export class DecisionGraphEngine {
  readonly workflows: WorkflowCatalog;
  private readonly engine = new WorkflowEngine();

  constructor(opts: DecisionGraphEngineOptions = {}) {
    this.workflows = opts.workflows ?? defaultCatalog();
  }

  /** Low-level escape hatch: run any workflow by instance or registered name. */
  run<I, O>(workflow: Workflow<I, O> | string, input: I, opts: RunOptions): WorkflowRunHandle<O> {
    const wf =
      typeof workflow === "string" ? (this.workflows.get(workflow) as unknown as Workflow<I, O>) : workflow;
    return this.engine.run(wf, input, opts);
  }

  private toRunOptions(o: EngineCallOptions): RunOptions {
    return {
      workspace: o.workspace,
      ...(o.sinks ? { sinks: o.sinks } : {}),
      ...(o.signal ? { signal: o.signal } : {}),
      ...(o.resume ? { resume: o.resume } : {}),
      ...(o.runId ? { runId: o.runId } : {}),
      ...(o.runStore ? { runStore: o.runStore } : {}),
    };
  }

  private exec<I, O>(wf: Workflow<I, O>, input: I, o: EngineCallOptions): Promise<WorkflowResult<O>> {
    return this.engine.run(wf, input, this.toRunOptions(o)).result;
  }

  /* ------------------------------ single ops ----------------------------- */

  ingest(o: EngineCallOptions & { source: SourceSystem; scope?: Partial<SyncScope> }): Promise<WorkflowResult<IngestOutput>> {
    return this.exec(ingestWorkflow, { source: o.source, ...(o.scope ? { scope: o.scope } : {}) }, o);
  }

  extract(o: EngineCallOptions & { components: string[] }): Promise<WorkflowResult<ExtractOutput>> {
    return this.exec(extractWorkflow, { components: o.components }, o);
  }

  buildGraph(o: EngineCallOptions & { link?: boolean }): Promise<WorkflowResult<GraphBuildOutput>> {
    return this.exec(graphBuildWorkflow, { link: o.link ?? false }, o);
  }

  link(o: EngineCallOptions): Promise<WorkflowResult<LinkOutput>> {
    return this.exec(linkWorkflow, undefined, o);
  }

  evaluate(o: EngineCallOptions & { component: string }): Promise<WorkflowResult<EvaluateOutput>> {
    return this.exec(evaluateWorkflow, { component: o.component }, o);
  }

  replay(o: EngineCallOptions & { recordedRunId: string }): Promise<WorkflowResult<ReplayOutput>> {
    return this.exec(replayWorkflow, { runId: o.recordedRunId }, o);
  }

  export(o: EngineCallOptions & { format: ExportFormat }): Promise<WorkflowResult<ExportOutput>> {
    return this.exec(exportWorkflow, { format: o.format }, o);
  }

  /* ------------------------------ query ops ------------------------------ */

  async ask(o: EngineCallOptions & { question: string }): Promise<AskResult> {
    const r = await this.exec(queryWorkflow, { question: o.question }, o);
    return this.toAskResult(r);
  }

  /**
   * Counterfactual reasoning ("what if this decision never happened?"). Handled
   * through the query path — the planner detects counterfactual intent — so it
   * composes the same query workflow and returns the same shape.
   */
  async counterfactual(o: EngineCallOptions & { question: string }): Promise<AskResult> {
    const r = await this.exec(queryWorkflow, { question: o.question }, o);
    return this.toAskResult(r);
  }

  private toAskResult(r: WorkflowResult<AnsweredQuestion>): AskResult {
    return {
      ...r,
      ...(r.output ? { answer: r.output.answer, reasoning: r.output.trace, evidence: r.output.context.includedNodeIds } : {}),
    };
  }

  /* ----------------------------- composed op ----------------------------- */

  /**
   * analyze — the whole pipeline: (ingest?) → extract → buildGraph → link,
   * returning a repository summary. Halts on the first non-completed stage and
   * reports where it stopped. The caller never orchestrates workflows itself.
   */
  async analyze(
    o: EngineCallOptions & { components: string[]; source?: SourceSystem; scope?: Partial<SyncScope>; link?: boolean }
  ): Promise<AnalyzeResult> {
    const base: EngineCallOptions = {
      workspace: o.workspace,
      ...(o.sinks ? { sinks: o.sinks } : {}),
      ...(o.signal ? { signal: o.signal } : {}),
    };
    const steps: AnalyzeResult["steps"] = {};
    let events = 0;

    const halt = (
      status: WorkflowResult<unknown>["status"],
      stage: string,
      r: WorkflowResult<unknown>
    ): AnalyzeResult =>
      status === "truncated"
        ? { status: "truncated", steps, events }
        : { status: "failed", error: { message: r.error?.message ?? `${stage} failed`, stage }, steps, events };

    if (o.source) {
      const r = (steps.ingest = await this.ingest({ ...base, source: o.source, ...(o.scope ? { scope: o.scope } : {}) }));
      events += r.events;
      if (r.status !== "completed") return halt(r.status, "ingest", r);
    }

    const ex = (steps.extract = await this.extract({ ...base, components: o.components }));
    events += ex.events;
    if (ex.status !== "completed") return halt(ex.status, "extract", ex);

    const gb = (steps.graph = await this.buildGraph({ ...base, link: false }));
    events += gb.events;
    if (gb.status !== "completed") return halt(gb.status, "graph", gb);

    if (o.link !== false) {
      const lk = (steps.link = await this.link(base));
      events += lk.events;
      if (lk.status !== "completed") return halt(lk.status, "link", lk);
    }

    const store = o.workspace.stores().graph();
    const summary: AnalyzeSummary = {
      repo: o.workspace.config.repo,
      nodes: store.nodes().length,
      edges: store.edges().length,
      decisions: store.nodes({ type: "decision" }).length,
    };
    return { status: "completed", summary, steps, events };
  }
}
