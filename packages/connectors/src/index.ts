/**
 * @dg/connectors — source adapters + normalization + federation.
 *
 * Depends on @dg/core ports and @dg/engine services; never on a surface and
 * never on reasoning logic. GitHub is Connector #1; future sources add a
 * Connector + Normalizer here and change nothing downstream.
 */

export { GitHubConnector } from "./github/GitHubConnector.js";
export { GitHubNormalizer } from "./github/GitHubNormalizer.js";
export {
  FederatedEvidenceRepository,
  type FederatedSource,
} from "./federation/FederatedEvidenceRepository.js";
