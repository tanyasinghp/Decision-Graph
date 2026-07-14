/**
 * decisiongraph://sync — every connector's sync metadata, read straight from
 * Workspace → stores() → sync(). Read-only.
 */

import { currentWorkspace, type ResourceHandler } from "./types.js";

export const URI_SYNC = "decisiongraph://sync";

export const resSync: ResourceHandler = async (inv) => {
  const ws = await currentWorkspace(inv);
  const connectors = ws ? ws.stores().sync().list() : [];
  return { uri: URI_SYNC, contents: { count: connectors.length, connectors } };
};
