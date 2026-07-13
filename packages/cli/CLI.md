# Decision Graph CLI (`dg`)

`dg` is the first presentation layer over the Decision Graph platform. It is a
thin client: it parses commands, resolves a workspace, calls **one**
`DecisionGraphEngine` public API, renders progress, and prints results. All
reasoning lives in the engine — the CLI holds no business logic.

---

## Installation

The CLI ships inside the monorepo and runs through `tsx` in development:

```bash
# from the repo root
npm install
npm run dg -- <command> [options]
# e.g.
npm run dg -- doctor
```

A packaged build exposes a `dg` binary (`packages/cli/bin/dg.ts`); once built and
linked you can call `dg <command>` directly. Every example below shows the
`npm run dg --` form; drop that prefix when using the installed binary.

Requirements: Node ≥ 20, a `GITHUB_TOKEN` (PAT) for ingestion, and
`ANTHROPIC_API_KEY` for extraction / linking / evaluation / ask.

---

## Quick start

```bash
# 1. create a workspace in ./.decisiongraph
npm run dg -- init --repo razorpay/blade

# 2. wire the GitHub connector (PAT read from $GITHUB_TOKEN)
export GITHUB_TOKEN=ghp_…
npm run dg -- connect github

# 3. one command to do everything: ingest → extract → graph → link
npm run dg -- analyze --component Dropdown

# 4. ask a question
npm run dg -- ask "Why doesn't Dropdown use a native select element?"

# 5. export the graph
npm run dg -- export mermaid --out graph.mmd
```

Prefer step-by-step? `dg ingest`, `dg extract --component Dropdown`, `dg graph`.

---

## Workspace

A workspace is a local directory (default `./.decisiongraph/`) holding the
manifest (`config.json`), connector bindings, the evidence cache, the graph, run
journals and checkpoints. It is the only thing that resolves concrete stores.

```bash
npm run dg -- workspace current          # active repo
npm run dg -- workspace list             # known workspaces
npm run dg -- workspace show             # config + connectors
npm run dg -- workspace switch owner/name
```

Point at a different location with `--data-dir <path>`, or select a repo for a
single command with `--repo <owner/name>`.

---

## Connectors

GitHub is Connector #1.

```bash
npm run dg -- connect github                       # PAT via $GITHUB_TOKEN (recommended)
npm run dg -- connect github --token-env MY_TOKEN  # PAT from a different env var
npm run dg -- connect github --token ghp_…         # inline PAT (stored; discouraged)
# GitHub App auth is a planned placeholder (--app) and not yet available.
```

Adding future connectors (Slack, Jira, Linear, Notion, Figma, Google Docs,
Confluence, transcripts) will not change any `dg` command — they normalize into
the same evidence model behind the same workspace.

---

## Commands

| Command | What it does |
|---|---|
| `dg init --repo <o/n>` | Initialize a local workspace + cache structure |
| `dg connect github` | Configure the GitHub connector |
| `dg ingest [github]` | Synchronize a connector into the workspace |
| `dg extract --component <Name>` | Extract decisions from evidence |
| `dg graph [--no-link]` | Build/rebuild the Decision Graph |
| `dg analyze --component <Name>` | ingest → extract → graph → link + summary |
| `dg ask [question]` | Ask the graph (interactive if omitted) |
| `dg replay --run <id>` | Replay a recorded run (no model call) |
| `dg export [json\|graphml\|mermaid]` | Export the graph (`--out <file>`) |
| `dg workspace <list\|show\|switch\|current>` | Manage workspaces |
| `dg doctor` | Workspace / connector / cache / engine health |

### Global options

`--repo <o/n>` · `--workspace <ref>` · `--data-dir <path>` · `--json` ·
`--no-color` · `--resume [--run <id>]` · `--model <name>` · `--help` ·
`--version`.

### Output modes

- **TTY** — colors, a live spinner for the running step, committed `✓` lines for
  finished steps and connector sub-progress, tables for summaries.
- **`--json`** — a single machine-readable result object on **stdout**; progress
  `WorkflowEvent`s stream as JSONL on **stderr**. The CLI is only a sink for
  those events — it never polls and never duplicates a line.

### Exit codes

`0` success · `1` failure · `2` usage error · `4` cancelled (resumable).

---

## Examples

```
$ npm run dg -- analyze --component Dropdown

Analyzing razorpay/blade
  ✓ Synchronize source into workspace (1.2s)
  ✓ Reading Issues (128/128)
  ✓ Reading Pull Requests (64/64)
  ✓ Reading Commits (500/500)
  ✓ Extract decisions — Dropdown (9.4s)
    ★ Dropdown exposes a controlled-only selection API [high]
  ✓ Build graph nodes + edges (0.3s)
  ✓ Link decisions (SUPERSEDES / INFORMS) (3.1s)

Repository Summary
  Metric          Value
  ──────────────  ─────────────────────────────
  Commits         500
  Issues          128
  Pull Requests   64
  Decisions       7
  Components      1
  Confidence      5 high, 2 medium, 0 low
  Graph           41 nodes / 88 edges
```

```
$ npm run dg -- ask "Why doesn't Dropdown use a native select element?"
Searching engineering memory…

Answer
Blade renders a custom listbox rather than a native <select> to control styling,
grouped options, and cross-platform accessibility.

Reasoning
intent causal · rule why-not
A single high-confidence decision, cited to PR #1284, answers the question.

Evidence
decisions: decision:razorpay/blade:dropdown:native-vs-custom
sources:   https://github.com/razorpay/blade/pull/1284

Confidence
known

Replay ID: query-2026-07-13T…
```

```
$ npm run dg -- doctor
Decision Graph — doctor
  ✓ Workspace       razorpay/blade
  ✓ Connector       github ($GITHUB_TOKEN present)
  ✓ Cache           {"issues":128,"prs":64,"commits":500}
  ✓ Graph           41 nodes
  • Last sync       2026-07-13T09:12:44.031Z
  • Engine          v0.1.0
```

```
$ npm run dg -- ingest --json | jq .status
"completed"
```

---

## Error handling

`dg` renders failures gracefully rather than dumping stack traces:

- **Connector / authentication errors** (missing `GITHUB_TOKEN`) → a clear
  message and non-zero exit; `dg doctor` shows the missing token.
- **Cancellation** (Ctrl-C / SIGINT) → the run is checkpointed and the CLI prints
  `Resume with: dg <command> --resume --run <id>` (exit 4).
- **Validation / engine failures** → surfaced as `Failed: <message>` (the engine
  returns structured results; the CLI never throws on them).

---

## Future MCP compatibility

The CLI depends on exactly the same surface a future MCP server, REST API,
dashboard, or VS Code extension will use: `DecisionGraphEngine` +
`WorkspaceProvider`. Each `dg` command maps 1:1 to an engine method, and the
`WorkflowEvent` stream the TTY/JSON renderers consume is the identical stream an
MCP server will forward as progress notifications and a REST server will forward
over SSE. Nothing in the engine changes when those surfaces are added — they are
peers of the CLI, not layers on top of it.
