import * as fs from "node:fs";
import * as path from "node:path";
import type { SourceSystem, SyncMetadata, SyncStore } from "@dg/core";

export class LocalSyncStore implements SyncStore {
  constructor(private readonly dataDir: string) {}

  private syncFile(source: SourceSystem): string {
    return path.join(this.dataDir, "connectors", source, "sync.json");
  }

  write(meta: SyncMetadata): void {
    const f = this.syncFile(meta.source);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(meta, null, 2) + "\n", "utf8");
  }

  latest(source: SourceSystem): SyncMetadata | undefined {
    const f = this.syncFile(source);
    if (!fs.existsSync(f)) return undefined;
    try {
      return JSON.parse(fs.readFileSync(f, "utf8")) as SyncMetadata;
    } catch {
      return undefined;
    }
  }

  list(): SyncMetadata[] {
    const connectorsDir = path.join(this.dataDir, "connectors");
    if (!fs.existsSync(connectorsDir)) return [];
    const results: SyncMetadata[] = [];
    for (const entry of fs.readdirSync(connectorsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const meta = this.latest(entry.name as SourceSystem);
      if (meta) results.push(meta);
    }
    return results;
  }
}
