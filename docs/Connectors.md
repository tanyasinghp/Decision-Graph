# Connectors

## Overview

Connectors are the data ingestion layer. They read from external sources (GitHub, and planned: Slack, Jira, Linear, etc.) and normalize artifacts into a common evidence model.

## GitHub Connector

The GitHub connector is the only current connector implementation. It uses Octokit to read:

- **Issues** (including comments)
- **Pull Requests** (including review comments)
- **Commits** (commit messages and diffs)

### Requirements

- GitHub PAT (classic) with at minimum `public_repo` scope
- 5,000 requests/hour rate limit (authenticated)

Ollama/SSH tokens are not supported.

### Setup

```bash
# Via environment variable (recommended — token never stored)
export GITHUB_TOKEN=ghp_...
npm run dg -- connect github

# Via inline token (stored in config.json — discouraged)
npm run dg -- connect github --token ghp_...

# Via custom env var
npm run dg -- connect github --token-env MY_GITHUB_TOKEN
```

### Usage

```bash
# Ingest all artifacts
npm run dg -- ingest

# Ingest specific scope (planned)
npm run dg -- ingest --scope issues
```

### Cache

Ingested artifacts are cached in `./.decisiongraph/cache/`:

```
cache/
├── issues.json     # Array of Issue objects
├── prs.json        # Array of PullRequest objects
└── commits.json    # Array of Commit objects
```

Re-running `ingest` syncs incrementally (cached items are preserved; new items are appended).

## Planned Connectors

| Source | Status | Notes |
|--------|--------|-------|
| GitHub | ✅ Done | Issues, PRs, commits |
| GitHub App auth | 🔧 Planned | Alternative to PAT |
| Slack | 📋 Roadmap | Decision discussions |
| Jira | 📋 Roadmap | Ticket evidence |
| Linear | 📋 Roadmap | Issue tracking |
| Notion | 📋 Roadmap | Design docs |
| Figma | 📋 Roadmap | Design decisions |
| Google Docs | 📋 Roadmap | RFCs and specs |
| Confluence | 📋 Roadmap | Architecture docs |
| Meeting transcripts | 📋 Roadmap | Verbal decisions |

## Architecture

All connectors normalize into the same evidence model. Adding a new connector requires implementing the `Connector` interface from `@dg/core` and registering it in `ConnectorRegistry`. No presentation layer changes are needed.
