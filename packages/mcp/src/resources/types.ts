/**
 * Resource contracts. Resources are READ ONLY: they resolve the current
 * workspace and read through Workspace/Stores abstractions (never the
 * filesystem, never engine internals) and return structured JSON. They never
 * mutate state.
 */

import type { Workspace } from "@dg/core";
import type { McpContext } from "../context.js";

export interface ResourceInvocation {
  ctx: McpContext;
  /** Optional workspace ref; defaults to the first workspace the provider lists. */
  ref?: string;
}

export interface ResourceResult {
  uri: string;
  contents: unknown;
}

export type ResourceHandler = (inv: ResourceInvocation) => Promise<ResourceResult>;

export interface ResourceDefinition {
  uri: string;
  name: string;
  description: string;
}

/** Resolve the workspace a resource reads from, or undefined if none exists. */
export async function currentWorkspace(inv: ResourceInvocation): Promise<Workspace | undefined> {
  const ref = inv.ref ?? (await inv.ctx.provider.list())[0];
  if (!ref) return undefined;
  return inv.ctx.provider.resolve(ref);
}
