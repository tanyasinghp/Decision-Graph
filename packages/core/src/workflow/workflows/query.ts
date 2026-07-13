/**
 * query workflow — question → answer + reasoning trace.
 * A single step wrapping `QueryEngine.answerQuestion`.
 */

import { QueryEngine, type AnsweredQuestion } from "@dg/engine/query/QueryEngine.js";
import type { Step } from "../Step.js";
import type { Workflow } from "../Workflow.js";

export interface QueryInput {
  question: string;
}
export type QueryOutput = AnsweredQuestion;

const answerStep: Step<string, AnsweredQuestion> = {
  id: "query.answer",
  title: "Answer question from the Decision Graph",
  idempotent: true,
  async run(question, ctx) {
    const ws = ctx.workspace;
    const engine = new QueryEngine(ws.llm(), ws.stores().graph(), ws.config.repo);
    return engine.answerQuestion(question);
  },
};

export const queryWorkflow: Workflow<QueryInput, QueryOutput> = {
  name: "query",
  steps: [answerStep],
  async execute(input, ctx) {
    return ctx.runStep(answerStep, input.question);
  },
};
