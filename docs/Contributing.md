# Contributing

## Getting Started

1. Fork the repository
2. Run `npm install` in the root
3. Run `npm run typecheck` to verify your setup
4. Run `npm test` to confirm all tests pass

## Development Workflow

1. Create a feature branch from `main`
2. Make your changes
3. Run `npm run typecheck` — must pass with 0 errors
4. Run `npm test` — all 180+ tests must pass
5. Submit a pull request

## Architecture Constraints

Before making changes, understand the architecture:

- **Architecture is frozen at Version 1**: No new abstractions, no package moves, no public interface renames
- **Dependency rule**: `domain → engine → core ← connectors ← workspace-local ← {cli, mcp}` — no circular dependencies
- **CLI and MCP are thin clients**: They call `DecisionGraphEngine` public methods only — no business logic, no engine internals
- **Error handling**: The engine never throws on failure — it returns structured `WorkflowResult` with `status: "failed"` or `"truncated"`

## What to Contribute

### High Value (No Architecture Changes)

- Additional MCP tool implementations (follow existing patterns in `packages/mcp/src/tools/`)
- New connector implementations (implement `Connector` interface from `@dg/core`)
- Test coverage (tests are in root `tests/`)
- Documentation improvements
- Bug fixes

### Requires Discussion

- New workflow implementations
- Changes to public APIs (`DecisionGraphEngine`, workspace interfaces)
- Performance optimizations that change async contracts
- Frontend architecture changes

## Pull Request Checklist

- [ ] TypeScript compiles with 0 errors (`npm run typecheck`)
- [ ] All tests pass (`npm test`)
- [ ] No new circular dependencies
- [ ] No changes to public APIs unless discussed
- [ ] No architecture changes unless discussed
- [ ] New files follow existing conventions (see [Development.md](./Development.md#code-style))

## Code of Conduct

Be respectful, constructive, and inclusive. Focus on technical merit.
