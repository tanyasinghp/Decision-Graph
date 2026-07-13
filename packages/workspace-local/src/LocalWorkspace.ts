/**
 * LocalWorkspace — a workspace rooted at a local data/ directory.
 *
 * The only object that resolves concrete stores (via LocalStores), the run
 * store, the LLM client, and live connectors (via the injected registry).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { AnthropicClient } from "@dg/engine/llm/AnthropicClient.js";
import type { LlmClient } from "@dg/engine/llm/LlmClient.js";
import { ConfigError } from "@dg/domain/errors.js";
import type { SourceSystem } from "@dg/domain/graph.js";
import type {
  Connector,
  ConnectorBinding,
  ConnectorRegistry,
  RunStore,
  Stores,
  SyncCursor,
  Workspace,
  WorkspaceConfig,
  WorkspaceRef,
} from "@dg/core";
import { LocalStores } from "./LocalStores.js";
import { LocalRunStore } from "./LocalRunStore.js";

export class LocalWorkspace implements Workspace {
  private storesMemo: Stores | undefined;
  private runStoreMemo: RunStore | undefined;

  constructor(
    readonly ref: WorkspaceRef,
    readonly config: WorkspaceConfig,
    private readonly dir: string,
    private readonly registry: ConnectorRegistry,
    private readonly configPath: string
  ) {}

  stores(): Stores {
    if (!this.storesMemo) {
      this.storesMemo = new LocalStores(this.dir, this.config.repo, this.runsDir(), this.connectors());
    }
    return this.storesMemo;
  }

  llm(model?: string): LlmClient {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new ConfigError("Missing env var ANTHROPIC_API_KEY (see .env.example)");
    return new AnthropicClient(key, model ?? this.config.model);
  }

  dataDir(): string {
    return this.dir;
  }

  runsDir(): string {
    return path.join(this.dir, "runs");
  }

  runStore(): RunStore {
    if (!this.runStoreMemo) this.runStoreMemo = new LocalRunStore(this.runsDir());
    return this.runStoreMemo;
  }

  connectors(): ConnectorBinding[] {
    return this.config.connectors ?? [];
  }

  connector(source: SourceSystem): Connector {
    return this.registry.get(source);
  }

  saveCursor(source: SourceSystem, cursor: SyncCursor): void {
    const bindings = this.connectors();
    const binding = bindings.find((b) => b.source === source);
    if (binding) binding.cursor = cursor;
    else bindings.push({ source, config: {}, cursor });
    this.config.connectors = bindings;
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2) + "\n", "utf8");
  }
}
