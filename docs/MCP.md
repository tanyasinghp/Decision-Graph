# MCP (Model Context Protocol)

## Overview

Decision Graph ships an MCP server that exposes the entire platform as tools and resources. Any MCP-compatible client (Claude Desktop, OpenCode, Cursor, VS Code extensions) can use these tools to analyze repositories, extract decisions, and answer questions.

## Quick Start

```bash
# Install dependencies
npm install

# Start the MCP server (stdio transport)
npm run dg-mcp
```

The server listens on **stdin/stdout** (MCP stdio transport) and logs diagnostics to stderr.

## Tools

| Tool | Description |
|------|-------------|
| `dg_doctor` | Workspace / connector / graph health |
| `dg_ingest` | Synchronize a connector into the workspace |
| `dg_extract` | Extract decisions for specific components |
| `dg_graph` | Build the decision graph from extracted components |
| `dg_link` | Link extracted decisions across the graph |
| `dg_analyze` | Full pipeline: ingest → extract → graph → link |
| `dg_evaluate` | Evaluate ground-truth coverage for a component |
| `dg_ask` | Ask the Decision Graph a question |
| `dg_counterfactual` | Ask a "what if" counterfactual question |
| `dg_export` | Export graph in json, graphml, or mermaid format |
| `dg_replay` | Replay a previous run from its run ID |

## Resources

| URI | Description |
|-----|-------------|
| `decisiongraph://workspace/current` | Current workspace metadata |
| `decisiongraph://sync` | Sync metadata for all connectors |
| `decisiongraph://graph` | Graph node/edge counts and stats |
| `decisiongraph://decisions` | Decision count and confidence distribution |
| `decisiongraph://runs` | Recent workflow runs |

## Client Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "decision-graph": {
      "command": "npx",
      "args": ["tsx", "/path/to/decision-graph/packages/mcp/bin/dg-mcp.ts"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "GITHUB_TOKEN": "ghp_...",
        "DG_DATA_DIR": "/path/to/workspace/.decisiongraph"
      }
    }
  }
}
```

> **Note**: The `ANTHROPIC_API_KEY` in the MCP server env is used for the engine's LLM calls, not for Claude Desktop itself. Claude Desktop needs its own API key separately.

### OpenCode

Add to your `opencode.json`:

```json
{
  "mcpServers": {
    "decision-graph": {
      "command": "npx",
      "args": ["tsx", "/path/to/decision-graph/packages/mcp/bin/dg-mcp.ts"],
      "env": {
        "GITHUB_TOKEN": "ghp_..."
      }
    }
  }
}
```

### Cursor

In Cursor settings → Features → MCP Servers:

```
Name: decision-graph
Type: command
Command: npx tsx /path/to/decision-graph/packages/mcp/bin/dg-mcp.ts
Environment: ANTHROPIC_API_KEY=sk-ant-... GITHUB_TOKEN=ghp_...
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key (for engine LLM calls) |
| `GITHUB_TOKEN` | Yes | GitHub PAT with `public_repo` scope |
| `DG_DATA_DIR` | No | Workspace data directory (default: `./.decisiongraph/`) |
| `DG_MODEL` | No | Override model (default: `claude-sonnet-4-5`) |

## Protocol

- **Transport**: stdio (MCP StdioServerTransport)
- **SDK**: `@modelcontextprotocol/sdk` ^1.29.0
- **Notifications**: `notifications/progress` and `notifications/message` for workflow progress
