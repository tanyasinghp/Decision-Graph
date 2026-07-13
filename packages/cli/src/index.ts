/**
 * @dg/cli — the Decision Graph CLI, the first presentation layer over
 * DecisionGraphEngine. Depends only on @dg/core + the composition-root wiring.
 */

export { run } from "./app.js";
export { buildContext, type Ctx, type BuildOptions } from "./context.js";
export type { IO } from "./io.js";
