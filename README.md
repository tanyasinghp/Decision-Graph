# Decision Graph

> Reconstructs organizational decisions from engineering artifacts using LLM-powered analysis.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-20+-green)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**Decision Graph** extracts design decisions from PRs, issues, commits, and discussions, links them into a queryable graph, and answers natural-language questions about *why* code was written the way it was.

## Getting Started in 5 Minutes

```bash
# 1. Prerequisites
git clone <repo-url>
cd decision-graph

# 2. Install
npm install

# 3. Set up your environment
cp .env.example .env
# Edit .env: fill in ANTHROPIC_API_KEY and GITHUB_TOKEN

# 4. Run the health check
npm run dg -- doctor

# 5. Try it with a real repo
npm run dg -- init --repo razorpay/blade
npm run dg -- connect github
npm run dg -- analyze --component Dropdown
npm run dg -- ask "Why doesn't Dropdown use a native select element?"
```

> ⏱️ First run takes ~30 seconds (downloads dependencies + first analysis). Subsequent runs are faster due to caching.

## Architecture

```
                        ┌─────────────────────────┐
                        │     Presentation         │
            ┌───────────┼──────────────────────────┤
            │           │  CLI (dg) │ MCP (dg-mcp) │
            │           │  Frontend │ (REST plan.) │
            │           └─────┬────────────────────┘
            │                 │
            │     ┌───────────┴──────────────┐
            │     │   Application (core)     │
            │     │  DecisionGraphEngine     │
            │     │  WorkflowEngine × 9 wfs  │
            │     └───────────┬──────────────┘
            │                 │
            │     ┌───────────┴──────────────┐
            │     │   Engine (engine)         │
            │     │  AgentLoop · GraphStore   │
            │     │  QueryEngine · LLM Client │
  Direction │     └───────────┬──────────────┘
  of deps   │                 │
     ↓      │     ┌───────────┴──────────────┐
            │     │   Domain (domain)         │
            │     │   Core types, no deps     │
            │     └───────────────────────────┘
            │
            ├──────────────────────────────────┐
            │   Adapters                       │
            │   GitHub Connector (connectors)  │
            │   Local Workspace (workspace-local)│
            └──────────────────────────────────┘
```

- **7 packages**, strict dependency direction: `domain → engine → core ← adapters ← presentation`
- **No circular dependencies** — verified by static analysis
- **180+ tests**, 15 test files, TypeScript strict mode

## Features

### CLI (`dg`)

```bash
# Initialize and analyze any GitHub repo
npm run dg -- init --repo owner/repo
npm run dg -- analyze --component ComponentName

# Ask questions in natural language
npm run dg -- ask "Why was this approach chosen?"

# Export the graph
npm run dg -- export mermaid --out graph.mmd

# Full pipeline with one command
npm run dg -- analyze --component Dropdown
```

[Full CLI Reference →](./docs/CLI.md)

### MCP Server (`dg-mcp`)

11 tools + 5 resources for any MCP-compatible client:

```json
// Claude Desktop — claude_desktop_config.json
{
  "mcpServers": {
    "decision-graph": {
      "command": "npx",
      "args": ["tsx", "/path/to/packages/mcp/bin/dg-mcp.ts"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "GITHUB_TOKEN": "ghp_..."
      }
    }
  }
}
```

[Full MCP Reference →](./docs/MCP.md)

## Supported Clients

| Client | Setup | Status |
|--------|-------|--------|
| **CLI** | `npm run dg -- <cmd>` | ✅ |
| **Claude Desktop** | MCP config (JSON above) | ✅ |
| **OpenCode** | MCP config in `opencode.json` | ✅ |
| **Cursor** | MCP server in settings | ✅ |
| VS Code Extension | MCP config in `settings.json` | ✅ |
| REST API | (planned) | 🔧 |

## Documentation

| Document | Description |
|----------|-------------|
| [📖 Architecture](./docs/Architecture.md) | Full system architecture, package map, data flow |
| [💻 CLI Reference](./docs/CLI.md) | All commands, flags, examples |
| [🔌 MCP Server](./docs/MCP.md) | Tools, resources, client configuration |
| [📁 Workspace](./docs/Workspace.md) | Local workspace structure and commands |
| [🔗 Connectors](./docs/Connectors.md) | GitHub connector setup, planned connectors |
| [📝 Decision Objects](./docs/DecisionObjects.md) | Decision entity model, structure, examples |
| [🕸️ Graph Model](./docs/GraphModel.md) | Node/edge types, schema, export formats |
| [🛠️ Development](./docs/Development.md) | Setup, commands, known debt |
| [🤝 Contributing](./docs/Contributing.md) | How to contribute, constraints, checklist |
| [🗺️ Roadmap](./docs/Roadmap.md) | Planned features, benchmarks, screenshots |

## Screenshots & Demo

> **TODO**: Add screenshots of:
> - CLI `dg analyze --component Dropdown` output (tables, checkmarks, timing)
> - MCP server running with Claude Desktop
> - Frontend graph visualization with interactive nodes
> - GIF of the CLI workflow from `init` to `ask`

A live frontend demo is available in the `frontend/` directory:

```bash
cd frontend && npm install && npm run dev
# Open http://localhost:3000
```

## Requirements

| Requirement | Minimum |
|-------------|---------|
| Node.js | 20+ |
| npm | 9+ |
| ANTHROPIC_API_KEY | Required for LLM calls (extract, link, ask) |
| GITHUB_TOKEN | Required for ingestion (classic PAT, `public_repo` scope) |

## Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...           # Anthropic API key
GITHUB_TOKEN=ghp_...                   # GitHub PAT (public_repo scope)

# Optional
DG_MODEL=claude-sonnet-4-5             # LLM model override
DG_TOOL_BUDGET=25                      # Max tool calls per LLM step
DG_DATA_DIR=./.decisiongraph           # Default workspace directory
```

## Benchmarks

> **TODO**: Formal benchmark results. Current ad-hoc measurements on `razorpay/blade`:
>
> | Operation | Time |
> |-----------|------|
> | Ingest (500 commits, 128 issues, 64 PRs) | ~1.2s |
> | Extract (single component) | ~9.4s |
> | Graph build (41 nodes, 88 edges) | ~0.3s |
> | Ask (single question) | ~2s |
> | Frontend demo bundle | 85 kB |

## Project Status

**Version 0.1.0** — Architecture frozen at Version 1. All core workflows are implemented. Focus is on connectors, presentation surfaces, and performance.

## License

MIT

<!-- ---

### 🚧 Items Flagged for Future Work

| Item | Status |
|------|--------|
| Screenshots/GIF of CLI and frontend | ⏳ Placeholder |
| Formal benchmark suite | ⏳ Placeholder |
| GitHub App auth | 📋 Planned |
| REST API server | 📋 Planned |
| VS Code extension | 📋 Planned |
| Frontend test coverage | 📋 Planned |
| Pre-built binary (no tsx) | 📋 Planned |
| Async I/O migration | 📋 Known debt | -->
