/**
 * @dg/domain — public barrel.
 *
 * The domain model shared by the engine and the core: Zod schemas, inferred
 * types, the graph model (nodes/edges/provenance), and the error hierarchy.
 * No runtime dependencies beyond zod; depends on nothing else in the repo.
 */
export * from "./errors.js";
export * from "./schemas.js";
export * from "./types.js";
export * from "./graph.js";
