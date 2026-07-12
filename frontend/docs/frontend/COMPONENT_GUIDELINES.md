# Component Guidelines

## Organization

Components are grouped by domain:

```
components/
  layout/     — App shell, headers, column layouts
  repo/       — Repository overview, stats
  graph/      — React Flow graph, canvas, legend
  reasoning/  — Reasoning timeline, events
  query/      — Question input, answer, confidence
  evidence/   — Evidence drawer, citation cards
  demo/       — Demo controls, replay, speed selector
  shared/     — Skeleton, empty state, error state, icons
```

## Conventions

- **One component per file.** Named export. Default export only for pages.
- **File name matches export name.** `ReasoningTimeline.tsx` exports `ReasoningTimeline`.
- **Props are typed inline** with `interface ComponentNameProps` at the top of each file.
- **"use client"** at the top of any file using hooks, state, browser APIs, or animation.
- **No barrel files** (`index.ts`). Explicit imports keep the dependency graph flat.
- **No default exports** except `app/**/page.tsx` and `app/**/layout.tsx`.

## Styling

- `cn()` from `@/lib/utils` for all conditional classes. Never `clsx` directly.
- Tailwind utility classes only. No CSS modules, no styled-components.
- Color values come from the theme in `tailwind.config.ts`. Never hardcode hex.
- Animation classes from the theme keyframes. Never inline keyframes.

## Component Patterns

- **Composition over props.** A StatsGrid renders StatCards, not a single config object.
- **Data arrives typed.** Components consume typed props, never `unknown` or `any`.
- **Loading is a component state.** Use `Skeleton` from `@/components/shared/Skeleton`.
- **Empty is not loading.** Show `EmptyState` with context-aware message.
- **Error is recoverable.** Show `ErrorState` with retry action when possible.

## Component Checklist

Before committing a component:
- [ ] Exported by name, not default
- [ ] Props interface defined
- [ ] Uses `cn()` for class names
- [ ] No hardcoded colors or spacing
- [ ] Loading state handled
- [ ] Empty/null state handled
- [ ] No `any` types
