/**
 * WorkflowCatalog — named lookup so surfaces can run a workflow by string
 * ("extract", "query", …) without importing it. The DecisionGraphEngine seeds
 * one with the built-in workflows.
 */

import { ConfigError } from "@dg/domain/errors.js";
import type { Workflow } from "./Workflow.js";

export class WorkflowCatalog {
  private readonly map = new Map<string, Workflow<unknown, unknown>>();

  register<I, O>(wf: Workflow<I, O>): this {
    this.map.set(wf.name, wf as unknown as Workflow<unknown, unknown>);
    return this;
  }

  get(name: string): Workflow<unknown, unknown> {
    const wf = this.map.get(name);
    if (!wf) throw new ConfigError(`Unknown workflow: "${name}". Known: ${this.list().join(", ") || "(none)"}`);
    return wf;
  }

  has(name: string): boolean {
    return this.map.has(name);
  }

  list(): string[] {
    return [...this.map.keys()].sort();
  }
}
