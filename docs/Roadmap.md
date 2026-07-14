# Roadmap

## Version 1 (Current — Frozen)

The current architecture is frozen at Version 1. No new abstractions, package moves, or public API changes.

### ✅ Done

- Core data model (Decision, Edge, Graph, Evidence)
- WorkflowEngine with checkpoint/resume/cancel
- DecisionGraphEngine facade (11 public methods)
- 9 workflows: ingest, extract, graphBuild, link, query, evaluate, replay, export, analyze
- GitHub connector (Issues, PRs, Commits)
- Local workspace provider (JSON graph, JSONL runs)
- CLI (dg) — 11 commands
- MCP server (dg-mcp) — 11 tools, 5 resources
- Frontend (Next.js) — graph visualization, replay, counterfactual UI
- 180+ tests passing
- Engineering hardening (atomic writes, sink isolation, path sanitization, config errors)

### Quality

- [x] Full test coverage for core paths
- [x] Error handling for all user-facing operations
- [x] Input validation at all public boundaries
- [x] Zero TypeScript errors (strict mode)
- [x] No circular dependencies

## Version 2 (Planned)

### Connectors

- [ ] GitHub App authentication (alternative to PAT)
- [ ] Slack connector (decision discussions)
- [ ] Linear connector (issue tracking evidence)
- [ ] Jira connector (ticket evidence)

### Presentation

- [ ] REST API server
- [ ] VS Code extension
- [ ] Pre-built CLI binary (no `tsx` dependency)

### Engine

- [ ] In-memory index for evidence search (currently O(n))
- [ ] Async I/O migration (currently ~22 `*Sync` calls)
- [ ] `CheckpointWriter.note()` implementation
- [ ] Confidence calibration improvements

### Frontend

- [ ] Context splitting (monolithic DemoContext)
- [ ] Error boundaries
- [ ] Unit test coverage
- [ ] Dynamic imports for framer-motion and reactflow
- [ ] 500+ node graph performance testing

## Benchmarks

> **Note**: Benchmarks are planned for Version 2. Current performance data is collected ad-hoc.

| Metric | Current | Target |
|--------|---------|--------|
| Ingest (500 commits, 128 issues, 64 PRs) | ~1.2s | < 1s |
| Extract (single component) | ~9.4s | < 5s |
| Graph build (41 nodes, 88 edges) | ~0.3s | < 0.1s |
| Link (per decision pair) | ~3.1s | < 1s |
| Ask (single question) | ~2s | < 1s |
| Frontend bundle (demo page) | 85 kB | < 60 kB |
| Replay FPS (60 events) | 60 FPS | 60 FPS |
| MCP tool response (cached workspace) | < 100ms | < 50ms |

## Screenshots

> **TODO**: Add screenshots of the CLI in action, the MCP server running, the frontend graph visualization, and Claude Desktop integration.

## Demo

A live demo frontend is available in the `frontend/` directory:

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to explore an interactive graph visualization with pre-recorded reasoning replays and counterfactual analysis. See [frontend/README.md](../frontend/README.md) for details.
