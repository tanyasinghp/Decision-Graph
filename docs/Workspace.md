# Workspace

## What Is a Workspace?

A workspace is a local directory (default `./.decisiongraph/`) that holds everything Decision Graph needs to operate on a single repository:

```
.decisiongraph/
├── config.json          # Workspace manifest (repo, model, connector bindings)
├── cache/               # Connector cache (ingested artifacts)
│   ├── issues.json
│   ├── prs.json
│   └── commits.json
├── runs/                # Workflow run journals (JSONL)
│   └── <runId>.jsonl
├── decisions/           # Extracted decisions per component
│   └── <component>.json
├── graph.json           # The Decision Graph (nodes + edges)
└── checkpoints/         # Resume checkpoints for cancelled runs
    └── <runId>.json
```

## Commands

```bash
# Initialize a workspace
npm run dg -- init --repo razorpay/blade

# Show active workspace
npm run dg -- workspace current

# List all workspaces
npm run dg -- workspace list

# Show workspace config
npm run dg -- workspace show

# Switch to/create another workspace
npm run dg -- workspace switch owner/repo
```

## Custom Data Directory

Override the default `.decisiongraph/` location:

```bash
npm run dg -- init --repo razorpay/blade --data-dir /path/to/custom/location
npm run dg -- ask "Question" --data-dir /path/to/custom/location
```

Or via environment variable:

```bash
export DG_DATA_DIR=/path/to/custom/location
npm run dg-mcp  # Uses $DG_DATA_DIR
```

## Workspace Config (config.json)

```json
{
  "repo": "razorpay/blade",
  "model": "claude-sonnet-4-5",
  "promptVersion": "v2",
  "toolBudget": 25,
  "connectors": [
    {
      "source": "github",
      "config": {
        "tokenEnv": "GITHUB_TOKEN"
      }
    }
  ]
}
```

## Multiple Workspaces

You can manage workspaces for different repositories independently. Each has its own config, cache, runs, and graph.

```bash
npm run dg -- init --repo owner/repo-a
npm run dg -- init --repo owner/repo-b
npm run dg -- workspace switch owner/repo-b
```
