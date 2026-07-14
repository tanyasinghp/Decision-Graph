# Development

## Prerequisites

- Node.js 20+
- npm 9+
- TypeScript 5.7+

## Setup

```bash
git clone <repo>
cd decision-graph
npm install
```

## Monorepo Structure

```
decision-graph/
├── packages/
│   ├── domain/          # Core types — zero runtime code
│   ├── core/            # Application layer, WorkflowEngine, facade
│   ├── engine/          # Agent loop, graph store, query engine
│   ├── connectors/      # GitHub connector
│   ├── workspace-local/ # Local filesystem workspace
│   ├── cli/             # CLI (dg)
│   └── mcp/             # MCP server (dg-mcp)
├── tests/               # Integration tests
├── scripts/             # Ad-hoc automation scripts
├── prompts/             # LLM prompt templates (versioned)
├── frontend/            # Next.js frontend (separate app)
└── docs/                # Documentation
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dg -- <cmd>` | Run the CLI |
| `npm run dg-mcp` | Start the MCP server |
| `npm test` | Run all tests (vitest) |
| `npm run typecheck` | TypeScript type checking (`tsc --noEmit`) |

## Path Aliases

TypeScript path aliases are configured in `tsconfig.json`:

```json
{
  "paths": {
    "@dg/domain": ["packages/domain/src/index.ts"],
    "@dg/core": ["packages/core/src/index.ts"],
    "@dg/engine": ["packages/engine/src/index.ts"],
    "@dg/connectors": ["packages/connectors/src/index.ts"],
    "@dg/workspace-local": ["packages/workspace-local/src/index.ts"],
    "@dg/cli": ["packages/cli/src/index.ts"],
    "@dg/mcp": ["packages/mcp/src/index.ts"]
  }
}
```

## Tests

```bash
# Run all tests
npm test

# Run specific test file
npx vitest run tests/core.test.ts

# Watch mode
npx vitest
```

Test files are in the root `tests/` directory. There are 180+ tests across 15 files covering all packages.

## Known Technical Debt

The following items are known and intentionally deferred (they would require architecture or API changes):

| Issue | Location | Impact |
|-------|----------|--------|
| Synchronous I/O in async paths | 22 files use `*Sync` | Blocking event loop during I/O |
| `CheckpointWriter.note()` is a no-op | WorkflowEngine | Resume after truncation loses progress notifications |
| `EvidenceIndex` linear scan | engine/src/evidence/ | O(n) per search — slow for large datasets |
| Monolithic DemoContext | frontend/ | Unnecessary re-renders |
| Zero frontend test coverage | frontend/ | No unit tests for components |

## Code Style

- PascalCase for types, interfaces, and components
- camelCase for functions, variables, and methods
- No semicolons
- No comments (document intent through naming)
- Strict TypeScript with `noUncheckedIndexedAccess`
