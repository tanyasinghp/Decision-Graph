# Graph Model

## Overview

The Decision Graph is a directed property graph where nodes are engineering entities and edges are relationships between them. It is the central data structure that powers all analysis and querying.

## Nodes

| Type | Description | Example |
|------|-------------|---------|
| `decision` | A design decision | "Dropdown uses custom listbox" |
| `component` | A software component | "Dropdown", "Alert" |
| `repository` | The repository | "razorpay/blade" |
| `discussion` | An issue/PR that informed decisions | "PR #1284" |
| `person` | A contributor | "@username" |

## Edges

| Type | Description | Direction |
|------|-------------|-----------|
| `SUPERSEDES` | A decision replaced another | decision → decision |
| `INFORMS` | A decision influenced another | decision → decision |
| `RELATES_TO` | Two decisions are related | decision → decision |
| `DECIDED_IN` | A decision was made in a discussion | decision → discussion |
| `DISCUSSED_IN` | A topic was discussed | node → discussion |
| `PROPOSED_IN` | A decision was proposed | decision → discussion |
| `IMPLEMENTS` | Code implements a decision | component → decision |
| `MENTIONS` | An artifact references an entity | discussion → node |
| `CONTRADICTS` | Two decisions conflict | decision → decision |
| `DEPENDS_ON` | A decision depends on another | decision → decision |
| `AMENDS` | A decision modifies another | decision → decision |
| `EVIDENCE_OF` | An artifact is evidence for a decision | discussion → decision |

## Schema (graph.json)

```typescript
interface GraphFile {
  schemaVersion: number;       // Current: 2
  repo: string;                // "owner/name"
  nodes: Record<string, Node>;
  edges: Record<string, Edge>;
}

interface Node {
  id: string;
  type: NodeType;
  label: string;
  properties?: Record<string, unknown>;
}

interface Edge {
  id: string;
  source: string;      // Node ID
  target: string;      // Node ID
  type: EdgeType;
  properties?: Record<string, unknown>;
}
```

## Constraints

- Node and edge IDs are unique within a graph
- A decision can have multiple SUPERSEDES edges (superseded-by / supersedes)
- The graph is directed: edges have a source and target
- Cycles are allowed (e.g., two decisions that depend on each other)
- The graph is stored as a single `graph.json` file in the workspace

## Query Traversal

When answering a question, the query engine:

1. Identifies relevant decision nodes (by component, label, or text match)
2. Traverses edges to find connected decisions, evidence, and discussions
3. Builds a context window of connected nodes
4. Passes the context to an LLM for synthesis

## Export Formats

| Format | Description |
|--------|-------------|
| `json` | Full graph as JSON (same as graph.json) |
| `graphml` | XML-based graph format (importable into yEd, Gephi) |
| `mermaid` | Mermaid.js flowchart (renderable in GitHub-flavored markdown) |
