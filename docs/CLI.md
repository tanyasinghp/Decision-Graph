# CLI Reference

## Overview

The `dg` CLI is the primary way to interact with Decision Graph. It is a thin client: it parses commands, resolves a workspace, calls exactly one `DecisionGraphEngine` public method, renders progress, and prints results.

```bash
# Run via tsx in development:
npm run dg -- <command> [options]
```

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Initialize a workspace
npm run dg -- init --repo razorpay/blade

# 3. Connect to GitHub (PAT from $GITHUB_TOKEN)
export GITHUB_TOKEN=ghp_...
npm run dg -- connect github

# 4. Run the full pipeline for a component
npm run dg -- analyze --component Dropdown

# 5. Ask a question
npm run dg -- ask "Why doesn't Dropdown use a native select element?"

# 6. Export the graph
npm run dg -- export mermaid --out graph.mmd
```

## Commands

| Command | Description |
|---------|-------------|
| `init --repo <o/n>` | Initialize a local workspace |
| `connect github` | Configure the GitHub connector |
| `ingest [github]` | Sync connector data into workspace |
| `extract --component <Name>` | Extract decisions from evidence |
| `graph [--no-link]` | Build/rebuild the Decision Graph |
| `analyze --component <Name>` | Full pipeline: ingest → extract → graph → link + summary |
| `ask [question]` | Ask the Decision Graph (interactive if omitted) |
| `replay --run <id>` | Replay a recorded run (no model call) |
| `export [format]` | Export graph: json, graphml, or mermaid |
| `workspace <sub>` | Manage workspaces: list, show, switch, current |
| `doctor` | Workspace / connector / cache / engine health |

## Global Options

| Flag | Description |
|------|-------------|
| `--repo <o/n>` | Target repository/workspace |
| `--workspace <ref>` | Select workspace by reference |
| `--data-dir <path>` | Override workspace data directory (default: `./.decisiongraph/`) |
| `--json` | Machine-readable JSON output; progress on stderr |
| `--no-color` | Disable ANSI colors |
| `--resume [--run <id>]` | Resume a cancelled/crashed run |
| `--model <name>` | Override the LLM model |
| `--help` | Show help |
| `--version` | Show version |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Failure |
| 2 | Usage error |
| 4 | Cancelled (resumable with `--resume`) |

## Output Modes

- **TTY** (default): Colors, live spinner, committed checkmarks, tables
- **`--json`**: Single JSON result on stdout; progress events as JSONL on stderr

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for LLM calls |
| `GITHUB_TOKEN` | Yes | GitHub PAT (classic, `public_repo` scope) |
| `DG_MODEL` | No | Override default model (default: `claude-sonnet-4-5`) |
| `DG_TOOL_BUDGET` | No | Max LLM tool calls per step (default: 25) |
| `DG_DATA_DIR` | No | Default workspace data directory (MCP server) |
