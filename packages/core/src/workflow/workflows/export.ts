/**
 * export workflow — render the Decision Graph as json | graphml | mermaid.
 * A single step wrapping the engine's existing export functions.
 */

import { toGraphML, toJson, toMermaid } from "@dg/engine/graph/export.js";
import type { Step } from "../Step.js";
import type { Workflow } from "../Workflow.js";

export type ExportFormat = "json" | "graphml" | "mermaid";

export interface ExportInput {
  format: ExportFormat;
}
export interface ExportOutput {
  format: ExportFormat;
  content: string;
}

const exportStep: Step<ExportFormat, ExportOutput> = {
  id: "export.render",
  title: "Export graph",
  idempotent: true,
  async run(format, ctx) {
    const store = ctx.workspace.stores().graph();
    const content =
      format === "graphml" ? toGraphML(store) : format === "mermaid" ? toMermaid(store) : toJson(store);
    return { format, content };
  },
};

export const exportWorkflow: Workflow<ExportInput, ExportOutput> = {
  name: "export",
  steps: [exportStep],
  async execute(input, ctx) {
    return ctx.runStep(exportStep, input.format);
  },
};
