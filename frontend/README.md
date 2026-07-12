# Decision Graph — Frontend

A Next.js 15 application that visualizes product decisions reconstructed from engineering evidence. Built for the Claude Builders Showcase.

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## What It Does

The Decision Graph reconstructs *why* code was written the way it was — not just *what* changed. It extracts decision objects from PRs, issues, commits, and discussions, links them into a graph, and answers natural-language questions by traversing the graph.

This frontend provides a live demo experience:

- **Graph Visualization**: Interactive React Flow canvas with custom nodes and edges, auto-layout via dagre
- **Reasoning Replay**: Streaming timeline that shows the system's reasoning step by step, with synchronized graph animation
- **Evidence Explorer**: Slide-over drawer showing every piece of evidence with confidence badges, excerpts, and GitHub links
- **Counterfactual Analysis**: Hypothetical "what if" scenarios computed purely from the existing graph

## Project Structure

```
frontend/
├── app/                  # Next.js routes (/ landing, /demo main)
├── components/
│   ├── demo/             # DemoControls (play/stop/speed/progress)
│   ├── evidence/         # EvidenceDrawer, EvidenceCard
│   ├── graph/            # DecisionGraph, GraphCanvas, DecisionNode, GraphEdge
│   ├── layout/           # AppHeader, ThreeColumnLayout
│   ├── query/            # AnswerPanel, CounterfactualPanel, ConfidenceBadge
│   ├── reasoning/        # ReasoningTimeline, ReasoningEvent, PhaseHeader
│   ├── repo/             # RepoStatsGrid, StatCard
│   └── shared/           # Skeleton, EmptyState
├── hooks/                # useReasoningStream, useGraphController
├── lib/                  # State management, graph store, types, engines
├── public/demo/          # Static data (graph.json, runs/*.jsonl, examples.json)
└── styles/               # globals.css with Tailwind
```

## Documentation

| File | Contents |
|------|----------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Component tree, data flow, state management |
| [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md) | Pipeline architecture, key design decisions |
| [DEMO.md](./DEMO.md) | Demo walkthrough, questions reference, controls |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Setup, conventions, adding questions |

## Tech Stack

- **Framework**: Next.js 15 (App Router, static export)
- **Graph**: React Flow v11 + @dagrejs/dagre
- **Animation**: Framer Motion 11
- **Styling**: TailwindCSS 3.4
- **Icons**: Lucide React
- **Language**: TypeScript 5.7

## Build Output

```
Route (app)                 Size  First Load JS
┌ ○ /                     1.42 kB         150 kB
└ ○ /demo                   85 kB         233 kB
+ First Load JS shared     102 kB
```

## Requirements

- Node.js 18+
- npm 9+
- No backend required — runs entirely client-side from static JSON
