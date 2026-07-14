/**
 * Command handlers. Each one only: parse → resolve workspace → call ONE public
 * DecisionGraphEngine API → render. No business logic, no engine internals.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { DecisionGraphEngine, EngineCallOptions, ExportFormat, SourceSystem, Workspace, WorkspaceConfig } from "@dg/core";
import { flag, bool } from "./args.js";
import { CLI_VERSION, resolveWorkspace, type Ctx } from "./context.js";
import { CliError, UsageError } from "./errors.js";
import { ProgressReporter } from "./render/progress.js";
import { renderResult } from "./render/result.js";
import { fail, heading, jsonOut, kv, line, ok, table, warn } from "./render/output.js";
import { SYM } from "./io.js";

export type Command = (ctx: Ctx) => Promise<number>;

/* ------------------------------- helpers ------------------------------- */

function resumeOpts(ctx: Ctx): Pick<EngineCallOptions, "resume" | "runId"> {
  const run = flag(ctx.args, "run");
  if (bool(ctx.args, "resume")) return run ? { resume: { mode: "resume", runId: run } } : { resume: { mode: "auto" } };
  return {};
}

function opts(ctx: Ctx, ws: Workspace, reporter?: ProgressReporter): EngineCallOptions {
  return {
    workspace: ws,
    ...(reporter ? { sinks: [reporter.sink] } : {}),
    signal: ctx.signal,
    ...resumeOpts(ctx),
  };
}

function components(ctx: Ctx): string[] {
  const c = flag(ctx.args, "component");
  const list = c ? [c] : ctx.args.positionals.slice(1);
  return list;
}

/* -------------------------------- init --------------------------------- */

export const initCmd: Command = async (ctx) => {
  const repo = flag(ctx.args, "repo") ?? ctx.args.positionals[1] ?? ctx.ref;
  if (!repo) throw new UsageError("Usage: dg init --repo <owner/name>");

  const config: WorkspaceConfig = {
    repo,
    model: flag(ctx.args, "model") ?? "claude-sonnet-4-5",
    promptVersion: flag(ctx.args, "prompt") ?? "v2",
    toolBudget: Number(flag(ctx.args, "budget") ?? 25),
    connectors: [{ source: "github", config: { tokenEnv: "GITHUB_TOKEN" } }],
  };
  await ctx.provider.create(repo, config);
  for (const d of ["cache", "runs", "decisions"]) fs.mkdirSync(path.join(ctx.dataDir, d), { recursive: true });

  if (ctx.json) {
    jsonOut(ctx.io, { command: "init", status: "completed", workspace: repo, dataDir: ctx.dataDir });
    return 0;
  }
  ok(ctx.io, ctx.s, `Initialized Decision Graph workspace for ${ctx.s.bold(repo)}`);
  kv(ctx.io, ctx.s, [
    ["location", ctx.dataDir],
    ["manifest", "config.json"],
    ["connector", "github (PAT via $GITHUB_TOKEN)"],
  ]);
  line(ctx.io);
  line(ctx.io, ctx.s.dim("Next:  dg connect github   ·   dg ingest   ·   dg analyze --component <Name>"));
  return 0;
};

/* ------------------------------ connect -------------------------------- */

export const connectCmd: Command = async (ctx) => {
  const source = ctx.args.positionals[1] ?? "github";
  if (source !== "github") throw new UsageError("Only `dg connect github` is supported today.");
  if (bool(ctx.args, "app")) throw new CliError("GitHub App auth is not available yet — use a PAT.", 1, "connector");

  const ref = ctx.ref;
  if (!ref) throw new UsageError("Run `dg init` first.");
  const token = flag(ctx.args, "token");
  const tokenEnv = flag(ctx.args, "token-env") ?? "GITHUB_TOKEN";

  const current = await ctx.provider.resolve(ref);
  const config: WorkspaceConfig = { ...current.config };
  const bindings = (config.connectors ?? []).filter((b) => b.source !== "github");
  bindings.push({ source: "github", config: token ? { token } : { tokenEnv } });
  config.connectors = bindings;
  await ctx.provider.create(ref, config);

  const tokenPresent = Boolean(token ?? ctx.io.env[tokenEnv]);
  if (ctx.json) {
    jsonOut(ctx.io, { command: "connect", status: "completed", source, auth: token ? "pat-inline" : "pat-env", tokenEnv: token ? null : tokenEnv, tokenPresent });
    return 0;
  }
  ok(ctx.io, ctx.s, "Connected GitHub connector");
  if (token) warn(ctx.io, ctx.s, "Storing a PAT inline in config.json. Prefer $GITHUB_TOKEN (dg connect github --token-env GITHUB_TOKEN).");
  kv(ctx.io, ctx.s, [
    ["auth", token ? "PAT (inline)" : `PAT via $${tokenEnv}`],
    ["token", tokenPresent ? ctx.s.green("present") : ctx.s.red("missing")],
  ]);
  return 0;
};

/* ------------------------------- ingest -------------------------------- */

export const ingestCmd: Command = async (ctx) => {
  const source = (ctx.args.positionals[1] ?? "github") as SourceSystem;
  const ws = await resolveWorkspace(ctx);
  const reporter = new ProgressReporter(ctx.io, ctx.json);
  if (!ctx.json) heading(ctx.io, ctx.s, `Ingesting ${source} · ${ws.config.repo}`);

  const r = await ctx.engine.ingest({ ...opts(ctx, ws, reporter), source });
  reporter.finish();

  return renderResult(
    ctx,
    "ingest",
    r,
    () => {
      const o = r.output!;
      line(ctx.io);
      ok(ctx.io, ctx.s, `Ingested ${o.artifacts} artifacts from ${source}`);
      kv(ctx.io, ctx.s, Object.entries(o.counts).map(([k, v]) => [k, String(v)]));
    },
    () => ({ output: r.output })
  );
};

/* ------------------------------- extract ------------------------------- */

export const extractCmd: Command = async (ctx) => {
  const comps = components(ctx);
  if (comps.length === 0) throw new UsageError("Usage: dg extract --component <Name> [more…]");
  const ws = await resolveWorkspace(ctx);
  const reporter = new ProgressReporter(ctx.io, ctx.json);
  if (!ctx.json) heading(ctx.io, ctx.s, `Extracting decisions · ${comps.join(", ")}`);

  const r = await ctx.engine.extract({ ...opts(ctx, ws, reporter), components: comps });
  reporter.finish();

  return renderResult(
    ctx,
    "extract",
    r,
    () => {
      line(ctx.io);
      for (const c of r.output?.components ?? [])
        ok(ctx.io, ctx.s, `${c.component}: ${ctx.s.bold(String(c.decisions.length))} decisions ${ctx.s.dim(`($${c.stats.costUsd.toFixed(3)})`)}`);
    },
    () => ({ output: r.output })
  );
};

/* -------------------------------- graph -------------------------------- */

export const graphCmd: Command = async (ctx) => {
  const ws = await resolveWorkspace(ctx);
  const reporter = new ProgressReporter(ctx.io, ctx.json);
  const link = !bool(ctx.args, "no-link");
  if (!ctx.json) heading(ctx.io, ctx.s, `Building Decision Graph · ${ws.config.repo}`);

  const r = await ctx.engine.buildGraph({ ...opts(ctx, ws, reporter), link });
  reporter.finish();

  return renderResult(
    ctx,
    "graph",
    r,
    () => {
      const o = r.output!;
      line(ctx.io);
      ok(ctx.io, ctx.s, `Graph: ${ctx.s.bold(String(o.nodes))} nodes, ${ctx.s.bold(String(o.edges))} edges`);
      if (o.linked) line(ctx.io, ctx.s.dim(`  linking: ${o.linked.accepted}/${o.linked.proposed} edges accepted`));
    },
    () => ({ output: r.output })
  );
};

/* ------------------------------- analyze ------------------------------- */

export const analyzeCmd: Command = async (ctx) => {
  const comps = components(ctx);
  if (comps.length === 0) throw new UsageError("Usage: dg analyze --component <Name> [more…]");
  const ws = await resolveWorkspace(ctx);
  const reporter = new ProgressReporter(ctx.io, ctx.json);
  const source: SourceSystem | undefined = bool(ctx.args, "no-ingest") ? undefined : "github";
  if (!ctx.json) heading(ctx.io, ctx.s, `Analyzing ${ws.config.repo}`);

  const r = await ctx.engine.analyze({
    workspace: ws,
    components: comps,
    ...(source ? { source } : {}),
    link: !bool(ctx.args, "no-link"),
    sinks: [reporter.sink],
    signal: ctx.signal,
  });
  reporter.finish();

  if (ctx.json) {
    jsonOut(ctx.io, { command: "analyze", ...r });
    return r.status === "completed" ? 0 : r.status === "truncated" ? 4 : 1;
  }
  if (r.status === "truncated") {
    warn(ctx.io, ctx.s, "Cancelled — progress checkpointed.");
    return 4;
  }
  if (r.status === "failed") {
    fail(ctx.io, ctx.s, `Failed at ${ctx.s.bold(r.error?.stage ?? "?")}${r.error ? ": " + r.error.message : ""}`);
    return 1;
  }

  // Repository summary
  const counts = r.steps.ingest?.output?.counts ?? {};
  const conf: Record<string, number> = { high: 0, medium: 0, low: 0 };
  for (const c of r.steps.extract?.output?.components ?? [])
    for (const d of c.decisions) conf[d.confidence] = (conf[d.confidence] ?? 0) + 1;

  line(ctx.io);
  heading(ctx.io, ctx.s, "Repository Summary");
  table(
    ctx.io,
    ctx.s,
    ["Metric", "Value"],
    [
      ["Commits", String(counts.commits ?? "—")],
      ["Issues", String(counts.issues ?? "—")],
      ["Pull Requests", String(counts.prs ?? "—")],
      ["Decisions", String(r.summary?.decisions ?? 0)],
      ["Components", String(comps.length)],
      ["Confidence", `${ctx.s.green(`${conf.high} high`)}, ${conf.medium} medium, ${conf.low} low`],
      ["Graph", `${r.summary?.nodes ?? 0} nodes / ${r.summary?.edges ?? 0} edges`],
    ]
  );
  return 0;
};

/* --------------------------------- ask --------------------------------- */

export const askCmd: Command = async (ctx) => {
  const ws = await resolveWorkspace(ctx);
  let question = flag(ctx.args, "question") ?? ctx.args.positionals.slice(1).join(" ").trim();
  if (!question) {
    if (ctx.json) throw new UsageError("In --json mode, pass the question: dg ask --json \"…\"");
    question = await ctx.io.readLine(`${ctx.s.bold("Question")} ${ctx.s.dim("›")} `);
  }
  if (!question) throw new UsageError("No question provided.");

  if (!ctx.json && ctx.io.isTTY) line(ctx.io, ctx.s.dim("Searching engineering memory…"));
  const r = await ctx.engine.ask({ workspace: ws, question, signal: ctx.signal, ...resumeOpts(ctx) });

  return renderResult(
    ctx,
    "ask",
    r,
    () => {
      const a = r.answer!;
      heading(ctx.io, ctx.s, "Answer");
      line(ctx.io, a.answer);
      heading(ctx.io, ctx.s, "Reasoning");
      line(ctx.io, ctx.s.dim(`intent ${r.reasoning?.intent} · rule ${r.reasoning?.matchedRule}`));
      line(ctx.io, a.reasoningSummary);
      heading(ctx.io, ctx.s, "Evidence");
      line(ctx.io, `${ctx.s.dim("decisions:")} ${a.supportingDecisionIds.join(", ") || "(none)"}`);
      line(ctx.io, `${ctx.s.dim("sources:  ")} ${a.supportingEvidenceUrls.join("  ") || "(none)"}`);
      heading(ctx.io, ctx.s, "Confidence");
      line(ctx.io, ctx.s.bold(a.certainty));
      line(ctx.io);
      line(ctx.io, ctx.s.dim(`Replay ID: ${r.runId}`));
    },
    () => ({ answer: r.answer, evidence: r.evidence, reasoning: r.reasoning, replayId: r.runId })
  );
};

/* ------------------------------- replay -------------------------------- */

export const replayCmd: Command = async (ctx) => {
  const runId = flag(ctx.args, "run") ?? ctx.args.positionals[1];
  if (!runId) throw new UsageError("Usage: dg replay --run <runId>");
  const ws = await resolveWorkspace(ctx);
  const reporter = new ProgressReporter(ctx.io, ctx.json);
  if (!ctx.json) heading(ctx.io, ctx.s, `Replaying ${runId}`);

  const r = await ctx.engine.replay({ workspace: ws, recordedRunId: runId, sinks: [reporter.sink], signal: ctx.signal });
  reporter.finish();

  // Remap ENOENT to user-friendly "run not found"
  if (r.status === "failed" && r.error?.message?.includes("ENOENT")) {
    if (ctx.json) return jsonOut(ctx.io, { command: "replay", status: "failed", error: `Run "${runId}" not found` }), 1;
    fail(ctx.io, ctx.s, `Run "${runId}" not found in this workspace`);
    return 1;
  }

  return renderResult(
    ctx,
    "replay",
    r,
    () => {
      line(ctx.io);
      ok(ctx.io, ctx.s, `Replayed ${runId}: ${ctx.s.bold(String(r.output?.events ?? 0))} events`);
    },
    () => ({ output: r.output })
  );
};

/* ------------------------------- export -------------------------------- */

export const exportCmd: Command = async (ctx) => {
  const format = (flag(ctx.args, "format") ?? ctx.args.positionals[1] ?? "json") as ExportFormat;
  if (!["json", "graphml", "mermaid"].includes(format)) throw new UsageError("Format must be one of: json, graphml, mermaid.");
  const ws = await resolveWorkspace(ctx);
  const out = flag(ctx.args, "out");

  const r = await ctx.engine.export({ workspace: ws, format, signal: ctx.signal });
  if (r.status !== "completed" || !r.output) {
    return renderResult(ctx, "export", r, () => {}, () => ({}));
  }

  if (ctx.json) {
    jsonOut(ctx.io, { command: "export", status: "completed", format, content: r.output.content });
    return 0;
  }
  if (out) {
    await fs.promises.writeFile(out, r.output.content, "utf8");
    ok(ctx.io, ctx.s, `Wrote ${out} (${format})`);
  } else {
    ctx.io.stdout(r.output.content + (r.output.content.endsWith("\n") ? "" : "\n"));
  }
  return 0;
};

/* ------------------------------ workspace ------------------------------ */

export const workspaceCmd: Command = async (ctx) => {
  const sub = ctx.args.positionals[1] ?? "current";
  switch (sub) {
    case "current": {
      if (ctx.json) return jsonOut(ctx.io, { command: "workspace", sub, current: ctx.ref ?? null }), 0;
      line(ctx.io, ctx.ref ? ctx.s.bold(ctx.ref) : ctx.s.dim("(no workspace — run dg init)"));
      return 0;
    }
    case "list": {
      const refs = await ctx.provider.list();
      if (ctx.json) return jsonOut(ctx.io, { command: "workspace", sub, workspaces: refs }), 0;
      if (refs.length === 0) line(ctx.io, ctx.s.dim("(none)"));
      for (const ref of refs) line(ctx.io, `${ref === ctx.ref ? ctx.s.green(SYM.ok) : " "} ${ref}`);
      return 0;
    }
    case "show": {
      const ws = await resolveWorkspace(ctx);
      if (ctx.json) return jsonOut(ctx.io, { command: "workspace", sub, config: ws.config }), 0;
      heading(ctx.io, ctx.s, `Workspace ${ws.config.repo}`);
      kv(ctx.io, ctx.s, [
        ["repo", ws.config.repo],
        ["model", ws.config.model],
        ["prompt", ws.config.promptVersion],
        ["budget", String(ws.config.toolBudget)],
        ["connectors", (ws.config.connectors ?? []).map((b) => b.source).join(", ") || "(none)"],
        ["dataDir", ctx.dataDir],
      ]);
      return 0;
    }
    case "switch": {
      const target = ctx.args.positionals[2] ?? flag(ctx.args, "repo");
      if (!target) throw new UsageError("Usage: dg workspace switch <owner/name>");
      const current = ctx.ref ? await ctx.provider.resolve(ctx.ref) : undefined;
      const config: WorkspaceConfig = { ...(current?.config ?? { model: "claude-sonnet-4-5", promptVersion: "v2", toolBudget: 25 }), repo: target };
      await ctx.provider.create(target, config);
      if (ctx.json) return jsonOut(ctx.io, { command: "workspace", sub, current: target }), 0;
      ok(ctx.io, ctx.s, `Switched to ${ctx.s.bold(target)}`);
      return 0;
    }
    default:
      throw new UsageError("Usage: dg workspace <list|show|switch|current>");
  }
};

/* ------------------------------- doctor -------------------------------- */

export const doctorCmd: Command = async (ctx) => {
  let ws: Workspace | undefined;
  if (ctx.ref) {
    try { ws = await ctx.provider.resolve(ctx.ref); } catch { /* not resolvable */ }
  }
  const repo = ws?.config.repo ?? ctx.ref;
  const hasWorkspace = Boolean(ws);

  const githubBinding = (ws?.config.connectors ?? []).find((b) => b.source === "github");
  const tokenEnv = (githubBinding?.config.tokenEnv as string | undefined) ?? "GITHUB_TOKEN";
  const tokenPresent = Boolean((githubBinding?.config.token as string | undefined) ?? ctx.io.env[tokenEnv]);

  // Read sync metadata through Workspace only — no filesystem paths.
  const syncList = ws ? ws.stores().sync().list() : [];
  const githubSync = syncList.find((m) => m.source === "github");

  // Read graph through Workspace only — no filesystem paths.
  const graphNodes = ws ? ws.stores().graph().nodes().length : 0;

  const health = {
    engineVersion: CLI_VERSION,
    workspace: { ok: hasWorkspace, repo: repo ?? null, dataDir: ctx.dataDir },
    connector: { source: "github", tokenPresent, tokenEnv },
    cache: { counts: githubSync?.counts ?? null, lastSync: githubSync?.completedAt ?? null },
    graph: { nodes: graphNodes },
  };

  if (ctx.json) {
    jsonOut(ctx.io, { command: "doctor", ...health });
    return hasWorkspace ? 0 : 1;
  }

  const mark = (b: boolean) => (b ? ctx.s.green(SYM.ok) : ctx.s.red(SYM.fail));
  heading(ctx.io, ctx.s, "Decision Graph — doctor");
  line(ctx.io, `${mark(hasWorkspace)} Workspace       ${hasWorkspace ? repo : ctx.s.dim("not initialized (run dg init)")}`);
  line(ctx.io, `${mark(tokenPresent)} Connector       github ${ctx.s.dim(tokenPresent ? `($${tokenEnv} present)` : `(missing $${tokenEnv})`)}`);
  line(ctx.io, `${mark(Boolean(githubSync))} Cache           ${githubSync ? JSON.stringify(githubSync.counts) : ctx.s.dim("empty (run dg ingest)")}`);
  line(ctx.io, `${mark(graphNodes > 0)} Graph           ${graphNodes} nodes`);
  line(ctx.io, `${ctx.s.cyan(SYM.info)} Last sync       ${githubSync?.completedAt ?? ctx.s.dim("never")}`);
  line(ctx.io, `${ctx.s.cyan(SYM.info)} Engine          v${CLI_VERSION}`);
  if (!githubSync) line(ctx.io, ctx.s.dim("  Next:  dg ingest"));
  if (graphNodes === 0 && githubSync) line(ctx.io, ctx.s.dim("  Next:  dg graph"));
  return hasWorkspace ? 0 : 1;
};

/* ------------------------------ dispatch ------------------------------- */

export const COMMANDS: Record<string, Command> = {
  init: initCmd,
  connect: connectCmd,
  ingest: ingestCmd,
  extract: extractCmd,
  graph: graphCmd,
  analyze: analyzeCmd,
  ask: askCmd,
  replay: replayCmd,
  export: exportCmd,
  workspace: workspaceCmd,
  doctor: doctorCmd,
};
