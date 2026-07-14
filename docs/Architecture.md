# Architecture

## High-Level Overview

Decision Graph reconstructs organizational decisions from engineering artifacts (PRs, issues, commits, discussions) and answers natural-language questions by traversing the resulting graph.

```
┌──────────────────────────────────────────────────────────────┐
│                      Presentation Layer                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │
│  │  CLI      │  │  MCP     │  │ Frontend │  │ (REST / VS   │ │
│  │  (dg)    │  │  (dg-mcp)│  │ (Next.js)│  │  Code ext.)  │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘ │
│       │              │              │               │         │
├───────┴──────────────┴──────────────┴───────────────┴────────┤
│                     Application Layer                         │
│           ┌──────────────────────────────────┐                │
│           │     DecisionGraphEngine          │                │
│           │  (facade — single public API)    │                │
│           └────────────┬─────────────────────┘                │
│                        │                                      │
│           ┌────────────┴─────────────────────┐                │
│           │       WorkflowEngine             │                │
│           │  (run/checkpoint/resume/cancel)   │                │
│           └────────────┬─────────────────────┘                │
│                        │                                      │
│           ┌────────────┴─────────────────────┐                │
│           │       WorkflowCatalog            │                │
│           │  ingest · extract · graphBuild   │                │
│           │  link · query · evaluate · replay│                │
│           │  export                          │                │
│           └──────────────────────────────────┘                │
├──────────────────────────────────────────────────────────────┤
│                      Engine Layer                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │
│  │  Agent   │  │  Graph   │  │  Query   │  │ Evidence     │ │
│  │  Loop    │  │  Store   │  │  Engine  │  │ Repository   │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘ │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                    │
│  │  LLM     │  │ Context  │  │ Ground   │                    │
│  │  Client  │  │ Builder  │  │ Truth    │                    │
│  └──────────┘  └──────────┘  └──────────┘                    │
├──────────────────────────────────────────────────────────────┤
│                   Domain & Data Layer                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │
│  │  Domain  │  │ Core     │  │ Connector│  │ Workspace    │ │
│  │  Types   │  │ Events   │  │ Registry │  │ Provider     │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

## Package Map

| Package | Layer | Responsibility | Dependencies |
|---------|-------|----------------|--------------|
| `@dg/domain` | Domain | Core types: Decision, Edge, Graph, Evidence, Answer. Zero runtime code. | none |
| `@dg/core` | Application | WorkflowEngine, DecisionGraphEngine facade, EventBus, checkpoints, connector ports | `@dg/domain` |
| `@dg/engine` | Engine | Agent loop, graph store, query engine, LLM client, evidence repo, ground truth validation | `@dg/core` |
| `@dg/connectors` | Adapter | GitHub connector (Octokit), federated evidence repository | `@dg/core` |
| `@dg/workspace-local` | Adapter | Local filesystem workspace: JSON graph, JSONL runs, checkpoint store | `@dg/core` |
| `@dg/cli` | Presentation | CLI (`dg`) — parse args, resolve workspace, call engine, render | `@dg/core`, `@dg/workspace-local`, `@dg/connectors` |
| `@dg/mcp` | Presentation | MCP server (`dg-mcp`) — 11 tools, 5 resources | `@dg/core`, `@dg/workspace-local`, `@dg/connectors` |

## Dependency Rule

> All arrows point inward. Outer layers depend on inner layers; inner layers never depend on outer layers.

```
domain → engine → core ← connectors ← workspace-local ← {cli, mcp}
```

## Data Flow

1. **Ingest**: Connector reads from external source (GitHub) → normalized artifacts → sync store
2. **Extract**: LLM agent reads artifacts → extracts Decision objects with evidence references
3. **Graph**: Decisions become nodes → edges inferred from component/repo relationships
4. **Link**: LLM agent proposes SUPERSEDES/INFORMS edges → accepted edges are persisted
5. **Query**: Natural language question → graph traversal + LLM reasoning → answer with evidence chain
6. **Replay**: Recorded run log (JSONL) → deterministic replay with progress events
7. **Export**: Graph serialized to JSON, GraphML, or Mermaid format

## Key Design Decisions

- **No circular dependencies**: Verified by static analysis
- **Synchronous I/O in async paths**: Chosen for simplicity; documented in [Development.md](./Development.md#known-debt)
- **EventBus with sink isolation**: One failing sink never crashes the bus
- **Atomic checkpoint writes**: tmp+rename pattern prevents corruption
- **Partial JSONL tolerance**: Corrupt lines are silently skipped during replay
