/**
 * link workflow — assert SUPERSEDES / INFORMS edges over existing decisions.
 * A single step wrapping `LinkingAgent.run`.
 */

import { LinkingAgent, type LinkingResult } from "@dg/engine/agent/LinkingAgent.js";
import type { Step } from "../Step.js";
import type { Workflow } from "../Workflow.js";

export type LinkInput = void;
export type LinkOutput = LinkingResult;

const linkStep: Step<void, LinkingResult> = {
  id: "link.run",
  title: "Link decisions",
  idempotent: false,
  async run(_input, ctx) {
    const ws = ctx.workspace;
    const store = ws.stores().graph();
    const res = await new LinkingAgent(ws.llm(), store).run();
    store.flush();
    return res;
  },
};

export const linkWorkflow: Workflow<LinkInput, LinkOutput> = {
  name: "link",
  steps: [linkStep],
  async execute(_input, ctx) {
    return ctx.runStep(linkStep, undefined);
  },
};
