/**
 * @dg/workspace-local — the local filesystem WorkspaceProvider.
 *
 * Implements the @dg/core Workspace ports over the existing data/ layout,
 * reusing the engine's CacheStore / JsonGraphStore / CachedEvidenceRepository /
 * RunLog. Depends on @dg/core, @dg/engine and @dg/connectors; never on a surface.
 */

export { LocalWorkspaceProvider } from "./LocalWorkspaceProvider.js";
export type { LocalWorkspaceProviderOptions } from "./LocalWorkspaceProvider.js";
export { LocalWorkspace } from "./LocalWorkspace.js";
export { LocalStores } from "./LocalStores.js";
export { LocalDecisionStore } from "./LocalDecisionStore.js";
export { LocalEvidenceStore } from "./LocalEvidenceStore.js";
export { LocalRunStore } from "./LocalRunStore.js";
export { LocalCheckpointStore } from "./LocalCheckpointStore.js";
export { LocalSyncStore } from "./LocalSyncStore.js";
export { createLocalProvider } from "./createLocalProvider.js";
