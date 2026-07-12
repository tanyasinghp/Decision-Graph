/**
 * graph/GraphStore.ts — the graph persistence port + JSON implementation.
 *
 * ARCHITECTURAL DECISIONS:
 *  - KEYED MAPS for nodes and edges (dedup structural, same rationale as the
 *    evidence cache). Node ids are content-derived (idFor*), edge ids are
 *    type:from->to — merging repeated references is therefore free: asserting
 *    the same relationship twice lands on the same key.
 *  - UPSERT + VERSION + HISTORY: re-extraction updates nodes in place. If
 *    content actually changed, version bumps and the PRIOR snapshot is
 *    appended to graph-history.jsonl (append-only audit) — historical
 *    traversal reads history; current traversal reads the store. Decisions
 *    are never duplicated: same evidence → same id → same node.
 *  - DETERMINISM VIA INJECTED CLOCK: audit timestamps are the only
 *    non-content field; the clock is a constructor dependency, so "same
 *    input → byte-identical graph" is provable in tests with a fixed clock,
 *    and in production determinism holds over structure + content (the
 *    contentHash() ignores timestamps).
 *  - CYCLE PREVENTION where the edge type demands it (SUPERSEDES, INFORMS,
 *    GENERATED_FROM are DAGs): addEdge walks same-type edges from `to`
 *    looking for `from` before accepting. O(E) worst case, trivial at this
 *    scale, and it turns a subtle corruption into a loud error.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { GraphIntegrityError } from "../domain/errors.js";
import {
  EDGE_RULES,
  GraphFileSchema,
  edgeId,
  type EdgeType,
  type GraphEdge,
  type GraphFile,
  type GraphNode,
} from "../domain/graph.js";

export type NodeInput = Omit<GraphNode, "createdAt" | "updatedAt" | "version">;
export type EdgeInput = Omit<GraphEdge, "id" | "createdAt">;

export interface GraphStore {
  upsertNode(input: NodeInput): GraphNode;
  addEdge(input: EdgeInput): GraphEdge;
  getNode(id: string): GraphNode | undefined;
  nodes(filter?: { type?: GraphNode["type"] }): GraphNode[];
  edges(filter?: { type?: EdgeType; from?: string; to?: string }): GraphEdge[];
  flush(): void;
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeysDeep((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

/** Content identity: everything except audit fields. */
function contentHash(n: NodeInput): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(sortKeysDeep({ label: n.label, data: n.data, metadata: n.metadata, confidence: n.confidence, provenance: n.provenance })))
    .digest("hex");
}

export class JsonGraphStore implements GraphStore {
  private readonly file: string;
  private readonly historyFile: string;
  private graph: GraphFile;
  // Adjacency indexes, rebuilt on load, maintained on write. Traversal is
  // O(degree) per hop instead of O(E) scans.
  private out = new Map<string, GraphEdge[]>();
  private in_ = new Map<string, GraphEdge[]>();

  constructor(
    dataDir: string,
    repo: string,
    private readonly clock: () => string = () => new Date().toISOString()
  ) {
    this.file = path.join(dataDir, "graph.json");
    this.historyFile = path.join(dataDir, "graph-history.jsonl");
    this.graph = fs.existsSync(this.file)
      ? GraphFileSchema.parse(JSON.parse(fs.readFileSync(this.file, "utf8")))
      : { schemaVersion: 2, repo, nodes: {}, edges: {} };
    for (const e of Object.values(this.graph.edges)) this.index(e);
  }

  private index(e: GraphEdge): void {
    (this.out.get(e.from) ?? this.out.set(e.from, []).get(e.from)!).push(e);
    (this.in_.get(e.to) ?? this.in_.set(e.to, []).get(e.to)!).push(e);
  }

  upsertNode(input: NodeInput): GraphNode {
    const existing = this.graph.nodes[input.id];
    const ts = this.clock();

    if (!existing) {
      const node: GraphNode = { ...input, createdAt: ts, updatedAt: ts, version: 1 };
      this.graph.nodes[input.id] = node;
      return node;
    }
    if (contentHash(existing) === contentHash(input)) {
      return existing; // identical content: no-op, no version bump, no history noise
    }
    // Changed: archive prior snapshot, bump version, preserve createdAt.
    fs.mkdirSync(path.dirname(this.historyFile), { recursive: true });
    fs.appendFileSync(this.historyFile, JSON.stringify({ archivedAt: ts, node: existing }) + "\n", "utf8");
    const node: GraphNode = { ...input, createdAt: existing.createdAt, updatedAt: ts, version: existing.version + 1 };
    this.graph.nodes[input.id] = node;
    return node;
  }

  addEdge(input: EdgeInput): GraphEdge {
    const id = edgeId(input.type, input.from, input.to);
    const existing = this.graph.edges[id];
    if (existing) return existing; // idempotent: repeated assertions merge

    const fromNode = this.graph.nodes[input.from];
    const toNode = this.graph.nodes[input.to];
    if (!fromNode || !toNode) {
      throw new GraphIntegrityError(`Edge ${id}: missing endpoint node(s)`);
    }
    const rule = EDGE_RULES[input.type];
    if (!rule.from.includes(fromNode.type) || !rule.to.includes(toNode.type)) {
      throw new GraphIntegrityError(
        `Edge ${input.type} requires ${rule.from.join("|")} -> ${rule.to.join("|")}, got ${fromNode.type} -> ${toNode.type}`
      );
    }
    if (rule.acyclic && this.reaches(input.to, input.from, input.type)) {
      throw new GraphIntegrityError(`Edge ${id} would create a ${input.type} cycle`);
    }

    const edge: GraphEdge = { ...input, id, createdAt: this.clock() };
    this.graph.edges[id] = edge;
    this.index(edge);
    return edge;
  }

  /** BFS over same-type edges: does `from` reach `target`? */
  private reaches(from: string, target: string, type: EdgeType): boolean {
    const queue = [from];
    const seen = new Set<string>();
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (cur === target) return true;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const e of this.out.get(cur) ?? []) if (e.type === type) queue.push(e.to);
    }
    return false;
  }

  getNode(id: string): GraphNode | undefined {
    return this.graph.nodes[id];
  }

  nodes(filter?: { type?: GraphNode["type"] }): GraphNode[] {
    const all = Object.values(this.graph.nodes);
    return (filter?.type ? all.filter((n) => n.type === filter.type) : all)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  edges(filter?: { type?: EdgeType; from?: string; to?: string }): GraphEdge[] {
    let list: GraphEdge[];
    if (filter?.from) list = this.out.get(filter.from) ?? [];
    else if (filter?.to) list = this.in_.get(filter.to) ?? [];
    else list = Object.values(this.graph.edges);
    return list
      .filter((e) => (!filter?.type || e.type === filter.type) && (!filter?.from || e.from === filter.from) && (!filter?.to || e.to === filter.to))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  flush(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(sortKeysDeep(this.graph), null, 2) + "\n", "utf8");
    fs.renameSync(tmp, this.file);
  }

  /** Historical snapshots of a node, oldest first (for historical traversal). */
  nodeHistory(id: string): GraphNode[] {
    if (!fs.existsSync(this.historyFile)) return [];
    return fs.readFileSync(this.historyFile, "utf8")
      .split("\n").filter(Boolean)
      .map((l) => JSON.parse(l) as { node: GraphNode })
      .filter((h) => h.node.id === id)
      .map((h) => h.node);
  }
}
