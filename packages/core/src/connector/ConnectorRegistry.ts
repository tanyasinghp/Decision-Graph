/**
 * ConnectorRegistry — the Core-owned lookup from SourceSystem to a live
 * Connector. Surfaces and the ingest workflow resolve connectors through here;
 * concrete connectors (GitHubConnector, …) register themselves at the
 * composition root.
 */

import { ConfigError } from "@dg/domain/errors.js";
import type { SourceSystem } from "@dg/domain/graph.js";
import type { Connector } from "./types.js";

export class ConnectorRegistry {
  private readonly map = new Map<SourceSystem, Connector>();

  register(connector: Connector): this {
    this.map.set(connector.source, connector);
    return this;
  }

  get(source: SourceSystem): Connector {
    const c = this.map.get(source);
    if (!c) throw new ConfigError(`No connector registered for source "${source}". Registered: ${this.list().join(", ") || "(none)"}`);
    return c;
  }

  has(source: SourceSystem): boolean {
    return this.map.has(source);
  }

  list(): SourceSystem[] {
    return [...this.map.keys()];
  }
}
