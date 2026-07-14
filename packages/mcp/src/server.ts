/**
 * Server bootstrap — the real MCP server (Phase 3.4).
 *
 * Builds an official @modelcontextprotocol/sdk McpServer, registers the EXISTING
 * tool handlers (Phase 3.2) and resource handlers (Phase 3.3) unchanged, wires
 * WorkflowEvents → ProgressEmitter → real MCP progress/log notifications, and
 * connects a stdio transport. No business logic, no engine internals, no second
 * error-mapping layer (errors.ts is reused via the handlers' ToolResult).
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult, ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";

import { buildMcpContext, MCP_VERSION, SERVER_NAME, type BuildContextOptions, type McpContext } from "./context.js";
import type { ProgressEmitter } from "./progress.js";
import type { ToolResult } from "./tools/types.js";
import { dgDoctor, type DoctorArgs } from "./tools/doctor.js";
import { dgIngest, type IngestArgs } from "./tools/ingest.js";
import { dgExtract, type ExtractArgs } from "./tools/extract.js";
import { dgGraph, type GraphArgs } from "./tools/graph.js";
import { dgLink, type LinkArgs } from "./tools/link.js";
import { dgAnalyze, type AnalyzeArgs } from "./tools/analyze.js";
import { dgEvaluate, type EvaluateArgs } from "./tools/evaluate.js";
import { dgAsk, type AskArgs } from "./tools/ask.js";
import { dgCounterfactual, type CounterfactualArgs } from "./tools/counterfactual.js";
import { dgExport, type ExportArgs } from "./tools/export.js";
import { dgReplay, type ReplayArgs } from "./tools/replay.js";
import { toolDefinitions } from "./tools.js";
import { resourceDefinitions, resourceHandlers } from "./resources.js";

type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

export interface DgMcpServer {
  server: McpServer;
  context: McpContext;
}

/* ----------------------- WorkflowEvents → notifications ----------------------- */

/** Build a ProgressEmitter backed by the request's notification channel. */
function emitterFor(extra: ToolExtra): ProgressEmitter {
  const token = extra._meta?.progressToken;
  return {
    progress(u) {
      if (token === undefined) return;
      const note: ServerNotification = {
        method: "notifications/progress",
        params: {
          progressToken: token,
          progress: u.progress,
          ...(u.total !== undefined ? { total: u.total } : {}),
          ...(u.message ? { message: u.message } : {}),
        },
      };
      void extra.sendNotification(note);
    },
    log(e) {
      const note: ServerNotification = {
        method: "notifications/message",
        params: { level: e.level, data: e.data },
      };
      void extra.sendNotification(note);
    },
  };
}

/* --------------------------- ToolResult → CallToolResult --------------------------- */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** The single mapping point — reuses the handlers' ToolResult (errors.ts). */
function toCallToolResult(tr: ToolResult): CallToolResult {
  if (tr.isError) {
    return { content: [{ type: "text", text: tr.message }], isError: true, structuredContent: { ...tr } };
  }
  return {
    content: [{ type: "text", text: JSON.stringify(tr.structured, null, 2) }],
    ...(isRecord(tr.structured) ? { structuredContent: tr.structured } : {}),
  };
}

function descOf(name: string): string {
  return toolDefinitions.find((d) => d.name === name)?.description ?? name;
}

/* -------------------------------- registration -------------------------------- */

function registerAllTools(server: McpServer, ctx: McpContext): void {
  const wrap = <T>(handler: (inv: { ctx: McpContext; args: T; signal: AbortSignal; emitter: ProgressEmitter }) => Promise<ToolResult>) =>
    async (args: Record<string, unknown>, extra: ToolExtra) => {
      try {
        return toCallToolResult(await handler({ ctx, args: args as T, signal: extra.signal, emitter: emitterFor(extra) }));
      } catch (e) {
        return { content: [{ type: "text" as const, text: (e as Error).message }], isError: true };
      }
    };

  server.registerTool(
    "dg_doctor",
    { title: "dg_doctor", description: descOf("dg_doctor"), inputSchema: { workspace: z.string().optional() } },
    wrap<DoctorArgs>(({ ctx, args, signal, emitter }) => dgDoctor({ ctx, args, signal, emitter }))
  );

  server.registerTool(
    "dg_ingest",
    { title: "dg_ingest", description: descOf("dg_ingest"), inputSchema: { workspace: z.string(), source: z.string().optional() } },
    wrap<IngestArgs>(({ ctx, args, signal, emitter }) => dgIngest({ ctx, args, signal, emitter }))
  );

  server.registerTool(
    "dg_analyze",
    {
      title: "dg_analyze",
      description: descOf("dg_analyze"),
      inputSchema: { workspace: z.string(), components: z.array(z.string()), source: z.string().optional(), link: z.boolean().optional() },
    },
    wrap<AnalyzeArgs>(({ ctx, args, signal, emitter }) => dgAnalyze({ ctx, args, signal, emitter }))
  );

  server.registerTool(
    "dg_ask",
    { title: "dg_ask", description: descOf("dg_ask"), inputSchema: { workspace: z.string(), question: z.string() } },
    wrap<AskArgs>(({ ctx, args, signal, emitter }) => dgAsk({ ctx, args, signal, emitter }))
  );

  server.registerTool(
    "dg_extract",
    { title: "dg_extract", description: descOf("dg_extract"), inputSchema: { workspace: z.string(), components: z.array(z.string()) } },
    wrap<ExtractArgs>(({ ctx, args, signal, emitter }) => dgExtract({ ctx, args, signal, emitter }))
  );

  server.registerTool(
    "dg_graph",
    { title: "dg_graph", description: descOf("dg_graph"), inputSchema: { workspace: z.string(), link: z.boolean().optional() } },
    wrap<GraphArgs>(({ ctx, args, signal, emitter }) => dgGraph({ ctx, args, signal, emitter }))
  );

  server.registerTool(
    "dg_link",
    { title: "dg_link", description: descOf("dg_link"), inputSchema: { workspace: z.string() } },
    wrap<LinkArgs>(({ ctx, args, signal, emitter }) => dgLink({ ctx, args, signal, emitter }))
  );

  server.registerTool(
    "dg_evaluate",
    { title: "dg_evaluate", description: descOf("dg_evaluate"), inputSchema: { workspace: z.string(), component: z.string() } },
    wrap<EvaluateArgs>(({ ctx, args, signal, emitter }) => dgEvaluate({ ctx, args, signal, emitter }))
  );

  server.registerTool(
    "dg_counterfactual",
    { title: "dg_counterfactual", description: descOf("dg_counterfactual"), inputSchema: { workspace: z.string(), question: z.string() } },
    wrap<CounterfactualArgs>(({ ctx, args, signal, emitter }) => dgCounterfactual({ ctx, args, signal, emitter }))
  );

  server.registerTool(
    "dg_export",
    { title: "dg_export", description: descOf("dg_export"), inputSchema: { workspace: z.string(), format: z.enum(["json", "graphml", "mermaid"]) } },
    wrap<ExportArgs>(({ ctx, args, signal, emitter }) => dgExport({ ctx, args, signal, emitter }))
  );

  server.registerTool(
    "dg_replay",
    { title: "dg_replay", description: descOf("dg_replay"), inputSchema: { workspace: z.string(), runId: z.string() } },
    wrap<ReplayArgs>(({ ctx, args, signal, emitter }) => dgReplay({ ctx, args, signal, emitter }))
  );
}

function registerAllResources(server: McpServer, ctx: McpContext): void {
  for (const def of resourceDefinitions) {
    const handler = resourceHandlers[def.uri]!;
    server.registerResource(
      def.name,
      def.uri,
      { title: def.name, description: def.description, mimeType: "application/json" },
      async (uri) => {
        const r = await handler({ ctx });
        return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(r.contents, null, 2) }] };
      }
    );
  }
}

/** Build the MCP server with tools + resources registered. No transport attached. */
export function createServer(opts: BuildContextOptions = {}): DgMcpServer {
  const context = buildMcpContext(opts);
  const server = new McpServer({ name: SERVER_NAME, version: MCP_VERSION });
  registerAllTools(server, context);
  registerAllResources(server, context);
  return { server, context };
}

/** stdio entrypoint. stdout is reserved for the MCP wire protocol; logs go to stderr. */
export async function main(): Promise<void> {
  const { server } = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[dg-mcp] ${SERVER_NAME} v${MCP_VERSION} listening on stdio\n`);
}
