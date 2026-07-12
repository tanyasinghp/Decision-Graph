# Decision Graph — Frontend Architecture

## Overview

The Decision Graph frontend is a Next.js 15 App Router application that visualizes decisions extracted from GitHub repositories. It runs fully client-side, loading pre-computed graphs and run logs from static JSON files.

## High-Level Architecture

```mermaid
C4Context
  title System Context — Decision Graph Frontend
  Person(user, "Demo Operator", "Selects questions and explores the graph")
  System_Boundary(frontend, "Frontend (Next.js 15)") {
    System(ui, "UI Layer", "React components, Framer Motion animations")
    System(orchestrator, "Orchestration Layer", "Scenes, replay timing, context dispatch")
    System(engine, "Engine Layer", "Counterfactual analysis, evidence extraction")
    System(store, "Data Layer", "Graph store, demo context state")
  }
  System_Ext(data, "Static JSON", "public/demo/ graph.json, examples.json, runs/*.jsonl")
  Rel(user, ui, "Clicks, selects, observes")
  Rel(ui, orchestrator, "Dispatches actions")
  Rel(orchestrator, engine, "Calls pure functions")
  Rel(orchestrator, store, "Reads/writes state")
  Rel(store, data, "Fetches on mount")
  UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

## Data Flow

```mermaid
flowchart LR
    A[graph.json] --> B[GraphStore]
    C[examples.json] --> D[DemoContext]
    E[runs/*.jsonl] --> F[buildScenes]
    B --> G[DecisionGraph]
    D --> H[ThreeColumnLayout]
    F --> I[useReasoningStream]
    I --> J[Scene Loop]
    J --> K[tick dispatches]
    K --> L[APPEND_EVENT]
    K --> M[SET_CONFIDENCE]
    K --> N[SET_CAMERA_TARGET]
    K --> O[HIGHLIGHT_NODES]
    K --> P[ADD_EVIDENCE_ITEMS]
    L --> Q[ReasoningTimeline]
    M --> R[AnswerPanel]
    N --> S[useGraphController]
    O --> T[DecisionGraph]
    P --> U[EvidenceDrawer]
```

## Page Structure

```
app/
  page.tsx          — Landing page (fade-in hero, two CTAs)
  demo/page.tsx     — Main demo page (controls, graph, panels)
```

## Component Tree

```mermaid
flowchart TB
    DemoPage --> AppHeader
    DemoPage --> RepoStatsGrid
    DemoPage --> DemoControls
    DemoPage --> ThreeColumnLayout
    ThreeColumnLayout --> GraphCanvas
    ThreeColumnLayout --> ReasoningTimeline
    ThreeColumnLayout --> AnswerPanel
    ThreeColumnLayout --> CounterfactualPanel
    DemoPage --> EvidenceDrawer

    GraphCanvas --> DecisionGraph
    DecisionGraph --> DecisionNode
    DecisionGraph --> GraphEdge

    ReasoningTimeline --> ReasoningEvent
    ReasoningTimeline --> PhaseHeader

    AnswerPanel --> ConfidenceBadge
    AnswerPanel --> ExpandableSection

    CounterfactualPanel --> ExpandableSection

    EvidenceDrawer --> EvidenceCard
```

## State Management

A single React Context (`DemoContext`) holds all application state. The `useReducer` pattern provides deterministic state transitions through well-defined actions.

### Key State Slices

| Slice | Type | Consumers |
|-------|------|-----------|
| `graph` | `GraphStore \| null` | DecisionGraph, AnswerPanel (via store APIs) |
| `timeline` | `RunEvent[]` | ReasoningTimeline |
| `answer` | `AnsweredQuestion \| null` | AnswerPanel |
| `evidenceItems` | `EvidenceCardData[]` | EvidenceDrawer |
| `highlightedNodeIds` | `string[]` | DecisionGraph |
| `cameraTarget` | `{nodeId, zoom} \| null` | useGraphController |
| `currentConfidence` | `number` | AnswerPanel, EvidenceDrawer |
| `counterfactualResult` | `CounterfactualResult \| null` | CounterfactualPanel |
| `hypotheticalNodeIds` | `string[]` | DecisionGraph (counterfactual) |
| `predictedNodeIds` | `string[]` | DecisionGraph (counterfactual) |

## Key Directories

```
frontend/
  app/                  — Next.js routes
  components/
    demo/               — DemoControls
    evidence/           — EvidenceDrawer, EvidenceCard
    graph/              — DecisionGraph, GraphCanvas, nodes/, edges/
    layout/             — AppHeader, ThreeColumnLayout
    query/              — AnswerPanel, CounterfactualPanel, ConfidenceBadge, ExpandableSection
    reasoning/          — ReasoningTimeline, ReasoningEvent, PhaseHeader
    repo/               — RepoStatsGrid, StatCard
    shared/             — Skeleton, EmptyState
  hooks/                — useReasoningStream, useGraphController
  lib/                  — demo-context, graph-store, types, utils, counterfactual-engine, evidence-extractor, replay-orchestrator
  public/demo/          — Static data (graph.json, examples.json, runs/)
```
