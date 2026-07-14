/**
 * createLocalProvider — the platform's default composition wiring, shared by
 * every surface (CLI, MCP, …) so the "which connectors + which provider" bootstrap
 * lives in one place instead of being duplicated at each composition root.
 *
 * It is a convenience factory, not business logic: registry + GitHub connector +
 * local filesystem provider. Surfaces still choose to call it.
 */

import { ConnectorRegistry, type WorkspaceProvider } from "@dg/core";
import { GitHubConnector } from "@dg/connectors";
import { LocalWorkspaceProvider } from "./LocalWorkspaceProvider.js";

export function createLocalProvider(dataDir: string): WorkspaceProvider {
  const registry = new ConnectorRegistry().register(new GitHubConnector());
  return new LocalWorkspaceProvider({ dataDir, registry });
}
