# Contributing

## Development Setup

```bash
# Clone the repo
git clone <repo-url>
cd decision-graph/frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server (port 3000) |
| `npm run build` | Production build + typecheck |
| `npm run lint` | ESLint check |
| `npm run typecheck` | TypeScript type checking (`tsc --noEmit`) |

## Code Conventions

### File Organization

```
components/
  <domain>/          — One domain per directory
    <Component>.tsx  — PascalCase component files
    index.ts         — Barrel exports (optional)
lib/
  <module>.ts        — camelCase utility/engine files
hooks/
  use<hook>.ts       — camelCase hook files
app/
  page.tsx           — Route pages
  layout.tsx         — Root layout
```

### Naming

| Entity | Convention | Example |
|--------|------------|---------|
| React components | PascalCase | `DecisionNode.tsx` |
| Hooks | camelCase, `use` prefix | `useReasoningStream.ts` |
| Libraries/utilities | camelCase | `evidence-extractor.ts` |
| Types | PascalCase | `FlowNodeData` |
| Files (component) | Match export name | `AnswerPanel.tsx` |
| Files (utility) | kebab-case | `counterfactual-engine.ts` |

### Component Patterns

- Use `"use client"` for interactive components
- Use `memo` for components that render lists or update frequently
- Destructure props at the function definition
- Prefer `useCallback` for event handlers passed as props
- Use `cn()` utility for conditional class names

### State Management

- Use `useDemoContext()` for reading/writing global state
- Use local state (`useState`) for component-private UI state
- Never use `setTimeout`/`setInterval` in components — use the orchestrator loop instead

### Performance Rules

1. Every component that renders inside a `.map()` must be `memo`'d
2. Every derived value from context must use `useMemo`
3. Every event handler passed to child components must use `useCallback`
4. Dynamic Tailwind classes (`border-[${color}]`) must use inline `style` instead

### Error Handling

1. Every `async` function must have a `try/catch`
2. Every `graph`/`event.input`/`decision.evidence` access must guard against null/undefined
3. Every `.map()`, `.filter()`, `.find()` must have a fallback empty array
4. Replay failures must dispatch `SET_ERROR` (not just `console.error`)

## Adding a New Demo Question

1. Add an entry in `public/demo/examples.json`
2. For replay questions: add a JSONL run log to `public/demo/runs/`
3. For counterfactual questions:
   - Add a scenario function in `lib/counterfactual-engine.ts`
   - Map the `questionId` to the new function in `computeCounterfactual()`

## Adding a New Counterfactual Scenario

1. Add an entry in `public/demo/examples.json` with `"intent": "counterfactual"`
2. Implement a function in `lib/counterfactual-engine.ts` matching the pattern:
   ```typescript
   function computeMyScenario(graph: GraphStore): CounterfactualResult {
     // Use graph store traversal APIs only
     const decision = graph.getDecision("decision:...");
     // Build hypothetical changes and predicted consequences
     return { ... };
   }
   ```
3. Add the `questionId` mapping in `computeCounterfactual()`

## Architecture Diagram Updates

Architecture diagrams are written in Mermaid inside Markdown. Edit `ARCHITECTURE.md`, `SYSTEM_DESIGN.md`, or this file to update them. GitHub renders Mermaid natively.

## Before Submitting

1. Run `npm run build` — must compile without errors
2. Run `npm run lint` — must pass (pre-existing ESLint circular warning is acceptable)
3. Verify all demo questions still work
4. Check for missing null guards in new code
