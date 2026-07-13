/**
 * LocalWorkspaceProvider — resolves workspaces over the existing data/ layout.
 *
 * A workspace is a data directory + a config.json (repo, model, prompt version,
 * tool budget, connector bindings). This is the Phase 2.4 adapter behind the
 * core WorkspaceProvider port; a RemoteWorkspaceProvider can later satisfy the
 * same contract without the Workflow Engine changing.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ConnectorRegistry, Workspace, WorkspaceConfig, WorkspaceProvider, WorkspaceRef } from "@dg/core";
import { LocalWorkspace } from "./LocalWorkspace.js";

export interface LocalWorkspaceProviderOptions {
  /** Root data directory (defaults to the existing ./data). */
  dataDir: string;
  registry: ConnectorRegistry;
  defaults?: Partial<Pick<WorkspaceConfig, "model" | "promptVersion" | "toolBudget">>;
}

export class LocalWorkspaceProvider implements WorkspaceProvider {
  private readonly dataDir: string;
  private readonly registry: ConnectorRegistry;
  private readonly defaults: Required<
    Pick<WorkspaceConfig, "model" | "promptVersion" | "toolBudget">
  >;

  constructor(opts: LocalWorkspaceProviderOptions) {
    this.dataDir = opts.dataDir;
    this.registry = opts.registry;
    this.defaults = {
      model: opts.defaults?.model ?? "claude-sonnet-4-5",
      promptVersion: opts.defaults?.promptVersion ?? "v2",
      toolBudget: opts.defaults?.toolBudget ?? 25,
    };
  }

  private get configPath(): string {
    return path.join(this.dataDir, "config.json");
  }

  private readConfig(): WorkspaceConfig | undefined {
    if (!fs.existsSync(this.configPath)) return undefined;
    return JSON.parse(fs.readFileSync(this.configPath, "utf8")) as WorkspaceConfig;
  }

  private defaultConfig(ref: WorkspaceRef): WorkspaceConfig {
    return {
      repo: ref,
      model: this.defaults.model,
      promptVersion: this.defaults.promptVersion,
      toolBudget: this.defaults.toolBudget,
      connectors: [{ source: "github", config: {} }],
    };
  }

  async resolve(ref: WorkspaceRef): Promise<Workspace> {
    const config = this.readConfig() ?? this.defaultConfig(ref);
    return new LocalWorkspace(ref, config, this.dataDir, this.registry, this.configPath);
  }

  async create(ref: WorkspaceRef, config: WorkspaceConfig): Promise<Workspace> {
    const merged: WorkspaceConfig = {
      ...config,
      connectors: config.connectors ?? [{ source: "github", config: {} }],
    };
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.writeFileSync(this.configPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
    return new LocalWorkspace(ref, merged, this.dataDir, this.registry, this.configPath);
  }

  async list(): Promise<WorkspaceRef[]> {
    const config = this.readConfig();
    return config ? [config.repo] : [];
  }
}
