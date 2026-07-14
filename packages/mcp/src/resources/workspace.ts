/**
 * decisiongraph://workspace/current — current repository, workspace path,
 * configured connectors, engine version. Read-only.
 */

import { MCP_VERSION } from "../context.js";
import { currentWorkspace, type ResourceHandler } from "./types.js";

export const URI_WORKSPACE = "decisiongraph://workspace/current";

export const resWorkspaceCurrent: ResourceHandler = async (inv) => {
  const ws = await currentWorkspace(inv);
  const contents = ws
    ? {
        repository: ws.config.repo,
        workspacePath: ws.dataDir(),
        connectors: ws.connectors().map((b) => ({
          source: b.source,
          tokenEnv: (b.config.tokenEnv as string | undefined) ?? null,
          hasInlineToken: Boolean(b.config.token),
        })),
        engineVersion: MCP_VERSION,
      }
    : {
        repository: null,
        workspacePath: inv.ctx.dataDir,
        connectors: [],
        engineVersion: MCP_VERSION,
      };
  return { uri: URI_WORKSPACE, contents };
};
