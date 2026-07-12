import type { GraphNode, GraphEdge, GraphFile, NodeType, EdgeType, DecisionObject } from "./types";

export class GraphStore {
  private nodesMap = new Map<string, GraphNode>();
  private edgesMap = new Map<string, GraphEdge>();

  private outEdges = new Map<string, GraphEdge[]>();
  private inEdges = new Map<string, GraphEdge[]>();

  repo: string = "";

  constructor(data?: GraphFile) {
    if (data) this.load(data);
  }

  load(data: GraphFile): void {
    this.repo = data.repo;
    this.nodesMap.clear();
    this.edgesMap.clear();
    this.outEdges.clear();
    this.inEdges.clear();

    for (const [id, node] of Object.entries(data.nodes)) {
      this.nodesMap.set(id, node);
    }

    for (const [id, edge] of Object.entries(data.edges)) {
      this.edgesMap.set(id, edge);
      this.indexEdge(edge);
    }
  }

  private indexEdge(edge: GraphEdge): void {
    const out = this.outEdges.get(edge.from) ?? [];
    out.push(edge);
    this.outEdges.set(edge.from, out);

    const in_ = this.inEdges.get(edge.to) ?? [];
    in_.push(edge);
    this.inEdges.set(edge.to, in_);
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodesMap.get(id);
  }

  nodes(filter?: { type?: NodeType }): GraphNode[] {
    const all = [...this.nodesMap.values()];
    const filtered = filter?.type ? all.filter((n) => n.type === filter.type) : all;
    return filtered.sort((a, b) => a.id.localeCompare(b.id));
  }

  edges(filter?: { type?: EdgeType; from?: string; to?: string }): GraphEdge[] {
    let list: GraphEdge[];
    if (filter?.from) {
      list = this.outEdges.get(filter.from) ?? [];
    } else if (filter?.to) {
      list = this.inEdges.get(filter.to) ?? [];
    } else {
      list = [...this.edgesMap.values()];
    }

    return list
      .filter(
        (e) =>
          (!filter?.type || e.type === filter.type) &&
          (!filter?.from || e.from === filter.from) &&
          (!filter?.to || e.to === filter.to)
      )
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  neighbors(
    id: string,
    opts?: { edgeType?: EdgeType; direction?: "in" | "out" }
  ): GraphNode[] {
    const result: GraphNode[] = [];
    const seen = new Set<string>();

    const edges =
      opts?.direction === "in"
        ? this.inEdges.get(id) ?? []
        : opts?.direction === "out"
          ? this.outEdges.get(id) ?? []
          : [...(this.outEdges.get(id) ?? []), ...(this.inEdges.get(id) ?? [])];

    for (const edge of edges) {
      if (opts?.edgeType && edge.type !== opts.edgeType) continue;
      const neighborId = edge.from === id ? edge.to : edge.from;
      if (seen.has(neighborId)) continue;
      seen.add(neighborId);

      const node = this.nodesMap.get(neighborId);
      if (node) result.push(node);
    }

    return result;
  }

  getDecision(id: string): DecisionObject | null {
    const node = this.getNode(id);
    if (!node || node.type !== "decision") return null;
    return node.data as DecisionObject;
  }

  decisionNodes(): GraphNode[] {
    return this.nodes({ type: "decision" });
  }

  decisions(): DecisionObject[] {
    return this.decisionNodes()
      .map((n) => this.getDecision(n.id))
      .filter((d): d is DecisionObject => d !== null);
  }

  get stats() {
    const nodes = [...this.nodesMap.values()];
    const decisions = this.decisionNodes();
    const evidenceItems = decisions.reduce((sum, n) => {
      const d = this.getDecision(n.id);
      return sum + (d?.evidence.length ?? 0);
    }, 0);

    return {
      decisionCount: decisions.length,
      evidenceCount: evidenceItems,
      nodeCount: nodes.length,
      edgeCount: this.edgesMap.size,
    };
  }
}

export async function loadGraphFromUrl(url: string): Promise<GraphStore> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load graph from ${url}: ${response.statusText}`);
  }
  const data: GraphFile = await response.json();
  return new GraphStore(data);
}
