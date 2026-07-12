# Decision Graph — Frontend Architecture

**Target:** 8–10 minute live demo for Anthropic + Razorpay engineers
**Aesthetic:** Linear / Anthropic Console / Cursor / Vercel
**Stack:** Next.js 15 App Router · TypeScript · TailwindCSS · shadcn/ui · React Flow · Framer Motion · Lucide Icons

---

## 1. Project Structure

```
frontend/
├── package.json
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── public/
│   └── demo/                      # pre-cached demo data
│       ├── graph.json              # exported graph
│       ├── runs/                   # pre-recorded run logs
│       └── examples.json           # example questions + expected traces
├── app/
│   ├── layout.tsx                  # providers, theme, fonts
│   ├── page.tsx                    # Landing screen
│   └── demo/
│       └── page.tsx                # Main demo application page
├── components/
│   ├── landing/
│   │   ├── Hero.tsx                # Title, subtitle, CTAs
│   │   └── FeatureCards.tsx        # Three key differentiators
│   ├── repo/
│   │   ├── RepoHeader.tsx          # Repo name, branch, metadata
│   │   ├── RepoStatsGrid.tsx       # Commit/PR/issue/decision counts
│   │   └── GraphStats.tsx          # Node/edge counts, eval summary
│   ├── graph/
│   │   ├── DecisionGraph.tsx       # React Flow wrapper
│   │   ├── nodes/
│   │   │   ├── DecisionNode.tsx    # Diamond, prominent
│   │   │   ├── ArtifactNode.tsx    # Rect, issue/pr/commit/document
│   │   │   ├── ComponentNode.tsx   # Rounded rect
│   │   │   └── ActorNode.tsx       # Circle
│   │   ├── edges/
│   │   │   └── AnimatedEdge.tsx    # Type-colored, animates on traversal
│   │   └── panels/
│   │       ├── NodeDetails.tsx     # Side panel on click
│   │       └── VersionHistory.tsx  # Vertical timeline
│   ├── reasoning/
│   │   ├── ReasoningTimeline.tsx   # Streaming event list
│   │   └── ReasoningEvent.tsx      # Single event row
│   ├── query/
│   │   ├── QueryInput.tsx          # Question input + example picker
│   │   ├── AnswerPanel.tsx         # Final answer display
│   │   └── ConfidenceIndicator.tsx # Animated confidence badge
│   ├── evidence/
│   │   ├── EvidenceDrawer.tsx      # Slide-over drawer
│   │   └── EvidenceCard.tsx        # Formatted citation
│   ├── layout/
│   │   ├── ThemeProvider.tsx       # Dark mode by default
│   │   └── ThreeColumnLayout.tsx   # The main demo layout
│   └── shared/
│       ├── StatusBadge.tsx
│       └── ExpandableSection.tsx
├── lib/
│   ├── types.ts                    # Re-exported domain types
│   ├── graph-store.ts              # In-memory graph store (frontend version)
│   ├── demo-replay.ts              # Deterministic replay engine
│   ├── events.ts                   # RunEvent type narrowing helpers
│   └── utils.ts                    # cn(), formatters, etc.
├── hooks/
│   ├── useDemo.ts                  # Demo mode orchestration
│   ├── useGraphStore.ts            # Graph data access
│   └── useReasoningStream.ts       # Event stream consumer
├── styles/
│   └── globals.css                 # Tailwind imports + custom theme
└── types/
    └── index.ts                    # Shared type definitions
```

## 2. Component Hierarchy

```
App (layout.tsx)
├── Landing Page (page.tsx)             [route: /]
│   ├── Hero
│   │   ├── Title "Decision Graph"
│   │   ├── Subtitle
│   │   ├── Description
│   │   └── CTA Buttons (Analyze Repository / View Demo)
│   └── FeatureCards
│
└── Demo Page (page.tsx)                [route: /demo]
    ├── RepoHeader
    │   ├── Repository Name + Branch
    │   └── Decision Count / Evidence Count / Confidence
    ├── RepoStatsGrid
    │   ├── Commit Count · Issue Count · PR Count
    │   └── Graph Stats · Extraction Score
    ├── QueryInput
    │   ├── Text Input
    │   └── Example Questions Dropdown (demo mode)
    └── ThreeColumnLayout (visible after query)
        ├── Left: DecisionGraph
        │   ├── React Flow instance
        │   ├── Custom Nodes
        │   ├── Custom Edges
        │   └── NodeDetails (side panel, conditional)
        │       ├── Decision Object fields
        │       ├── Evidence list
        │       └── VersionHistory
        ├── Center: ReasoningTimeline
        │   ├── Streaming events
        │   ├── Phase markers
        │   └── Staggered entry animation
        └── Right: AnswerPanel
            ├── Question (repeated)
            ├── Final Answer
            ├── ConfidenceIndicator
            ├── ReasoningSummary (expandable)
            ├── Supporting Decisions (expandable)
            ├── Supporting Evidence (expandable)
            └── Missing Evidence (if any)
```

## 3. Routing Structure

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | `Landing` page | Hero + CTAs. Minimal, full-viewport. |
| `/demo` | `Demo` page | Single-page demo application. Contains all screens. |

The entire demo narrative unfolds within `/demo` via state progression:
1. On mount → Repository Overview (stats, counts)
2. User asks question → QueryInput activated
3. Query submitted → Three-column layout engages
4. Reasoning → Timeline streams, Graph animates, Answer panel fills
5. Post-answer → Graph exploration, Evidence Drawer, Node Details

No additional routes needed. The demo is a single continuous narrative.

## 4. State Management

**Pattern:** React Context for global state + local state for UI. No Redux/Zustand.

```
DemoContext
├── repo: RepoData
├── graph: GraphStore (in-memory, mirrors backend interface)
├── queryState: idle | planning | reasoning | answering | complete | error
├── currentQuestion: string
├── timeline: RunEvent[] (appended in real-time)
├── answer: AnsweredQuestion | null
├── highlightedNodes: Set<string>
├── highlightedEdges: Set<string>
├── selectedNode: string | null
├── selectedEvidence: Evidence | null
└── demoMode: boolean
```

**Demo mode** (`useDemo` hook):
- `npm run demo` → loads `public/demo/graph.json` + `public/demo/runs/*.jsonl` + `public/demo/examples.json`
- `useDemo` hook replays events at human-readable speed (configurable per phase)
- No network calls. All data pre-cached.
- The replay engine reads a run log and dispatches events at a simulated pace:
  - `run_started` → instant
  - `phase` → 500ms pause
  - `tool_call` → 800–1500ms pause (reading feels realistic)
  - `tool_result` → 300ms
  - `decision_emitted` → 1200ms (dramatic pause)
  - `run_finished` → 500ms

## 5. Data Flow Diagram

```
┌───────────────────────────────────────────────────────────┐
│                      DEMO MODE                            │
│                                                           │
│  public/demo/                    In-Memory                │
│  ├── graph.json ──────► GraphStore ──────► React Flow    │
│  ├── runs/*.jsonl ───► Replay Engine ──► ReasoningTimeline│
│  └── examples.json ──► Example Picker ──► QueryInput     │
│                                                           │
│  User clicks node ──► NodeDetails panel opens             │
│  User clicks citation ──► EvidenceDrawer slides in        │
│  Graph traversal event ──► Node glow + Edge illuminate    │
└───────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────┐
│                    LIVE MODE (future)                      │
│                                                           │
│  POST /api/ask {question}                                 │
│       │                                                  │
│       ▼                                                  │
│  SSE Stream ──► ReasoningTimeline (live)                  │
│       │                                                  │
│       ▼                                                  │
│  AnsweredQuestion ──► AnswerPanel + Graph highlights      │
└───────────────────────────────────────────────────────────┘
```

**Key principle:** The UI never consumes raw JSON. Everything passes through typed interfaces:

```typescript
// lib/types.ts — mirrors backend domain types, no backend dependency
// These are hand-written type definitions (not zod-derived) for frontend
// autonomy. The shapes are the same; the frontend is not coupled to the
// backend's package.json, module resolution, or zod version.

interface GraphNode {
  id: string;
  type: "decision" | "issue" | "pull_request" | "commit" | "component" | "actor" | "document" | "experiment" | "metric" | "question" | "feature" | "version";
  label: string;
  data: unknown;
  confidence: "high" | "medium" | "low" | null;
  provenance: { source: string; origin: string; url?: string };
  createdAt: string;
  updatedAt: string;
  version: number;
}

interface GraphEdge {
  id: string;
  type: "SUPPORTED_BY" | "IMPLEMENTS" | "SUPERSEDES" | "PROPOSED_IN" | "DISCUSSED_IN" | "REJECTED_ALTERNATIVE" | "VALIDATED_BY" | "AFFECTS" | "OWNED_BY" | "REFERENCES" | "GENERATED_FROM" | "INFORMS";
  from: string;
  to: string;
  confidence: "high" | "medium" | "low" | null;
  provenance: { source: string; origin: string; url?: string };
  rationale?: string;
  createdAt: string;
}
```

## 6. Animation Strategy

Every animation has a purpose. No decoration.

| Element | Animation | Purpose | When |
|---------|-----------|---------|------|
| Landing title | Fade in + slight slide up (0.8s) | Establish presence | Page load |
| CTA buttons | Fade in (1.2s stagger) | Guide eye to action | After title |
| Repo stats | Count-up numbers (1.5s) | Communicate scale | On mount |
| Graph nodes | React Flow `animate` | Show structure | On mount |
| Graph edges | Stroke-dashoffset animate | Show connectivity | On mount |
| Node glow | Box-shadow pulse (CSS) | Mark as visited | During traversal |
| Edge traversal | Animated dashed line filling | Show reasoning path | During traversal |
| Timeline events | Staggered slide-up (0.3s each) | Show reasoning live | During reasoning |
| Confidence badge | Scale in with color | Emphasize certainty | Answer arrives |
| Answer sections | Sequential fade-in | Reveal depth | After answer |
| Evidence drawer | Slide from right (0.3s ease) | Show detail | On citation click |
| Node details | Slide from right (0.3s ease) | Show detail | On node click |
| Version history | Vertical line draw + dot appear | Show evolution | On panel open |
| Phase transitions | Content cross-fade (0.2s) | Smooth narrative flow | State changes |

**Framer Motion usage:**
- `motion.div` for page/section transitions
- `AnimatePresence` for drawer/panel enter/exit
- `useAnimation` for controlled timeline sequencing
- `variants` with staggerChildren for list entries
- No spring physics (keep it snappy). Ease-in-out or custom cubic-bezier.

**Graph animations (React Flow):**
- Default `animated: true` on edges
- Custom edge component with CSS `stroke-dasharray` + `stroke-dashoffset` + `transition`
- Node glow via `box-shadow` CSS transition on data change
- Layout: `dagre` for initial layout, then free positioning for user interaction
- Fit-view on mount, smooth zoom/pan

## 7. React Flow Design

### Node Types

```
Decision (diamond)
┌──────────────┐
│  ◀ ▶         │  ← Lucide icon
│  Title       │  ← Bold, truncated
│  high/med    │  ← Confidence badge
└──────────────┘
  Color: amber-500 border, amber-50 fill (dim until visited)

Artifact (rectangle, rounded 8px)
┌────────────────┐
│  #1234 PR Title│  ← GitHub-style
│  ┌──┐          │
│  │PR│          │  ← Type badge
│  └──┘          │
└────────────────┘
  Color:
    issue:       blue-500
    pull_request: green-500
    commit:      purple-500
    document:    slate-500

Component (pill)
┌────────────────────┐
│  Dropdown          │
└────────────────────┘
  Color: cyan-500

Actor (circle)
  ╭─────╮
  │ 👤  │
  ╰─────╯
  Color: violet-500
```

### Edge Types

| Edge Type | Color | Style | Width |
|-----------|-------|-------|-------|
| SUPERSEDES | orange-500 | solid, animated | 3px |
| SUPPORTED_BY | emerald-500 | solid | 2px |
| IMPLEMENTS | blue-500 | dashed | 2px |
| REJECTED_ALTERNATIVE | red-500 | dashed | 2px |
| INFORMS | violet-400 | dotted, animated | 2px |
| PROPOSED_IN | amber-400 | solid | 1.5px |
| DISCUSSED_IN | slate-400 | solid | 1.5px |
| VALIDATED_BY | teal-400 | dotted | 2px |
| AFFECTS | cyan-400 | solid | 2px |
| OWNED_BY | pink-400 | dotted | 1.5px |
| REFERENCES | gray-400 | dashed | 1px |
| GENERATED_FROM | gray-400 | dotted | 1px |

### Visual States

- **Default:** All nodes at 40% opacity, no glow, thin borders
- **Visited:** Node at 100% opacity, glow (box-shadow: 0 0 12px theme color), thick border
- **Traversed edge:** Solid line with animated dash, glow
- **Selected:** Border highlight, expanded label, slight scale (1.05x)
- **Current reasoning target:** Pulsing glow (CSS keyframes)
- **Dim** (not yet reached): 20% opacity, no interaction

### Layout

Use `dagre` for automatic directed graph layout:
- Rank direction: TB (top-to-bottom)
- Decision nodes at top, artifacts below, actors at bottom
- SUPERSEDES chains vertically aligned
- Spacing: 150px horizontal, 100px vertical
- After initial layout: user can drag freely
- Fit view with padding on mount and after traversal

## 8. Demo Flow (npm run demo)

```
npm run demo → next dev with DEMO_MODE=true env

1. OPEN BROWSER → http://localhost:3000
   └── Landing: "Decision Graph"

2. CLICK "Analyze Repository"
   └── Navigate to /demo
   └── Load cached graph.json
   └── Show RepoHeader + RepoStatsGrid
   └── "razorpay/blade · main · 47 decisions · 312 evidence items · 86% extraction confidence"

3. QUERY INPUT APPEARS
   └── "Ask a question about the repository..."
   └── Example picker: "Why doesn't Dropdown use native select?"
       "What decisions shaped the BottomSheet component?"
       "How did the Alert component evolve?"
       "Which alternatives were rejected for Table?"

4. SELECT EXAMPLE QUESTION
   └── QueryInput transitions to "thinking" state
   └── ThreeColumnLayout expands

5. REASONING BEGINS
   └── Center column: ReasoningTimeline streams events
       "Planning traversal..."
       "Searching graph for 'Dropdown'..."
       "Found 3 seed decisions"
       "Following SUPERSEDES chain..."
       "Reading evidence from PR #1234..."
       "Inspecting Decision: 'Dropdown uses controlled-only API'"
       "Confidence increased..."
       "Generating reasoning context..."
       "Answer complete."

6. GRAPH ANIMATES
   └── Left column: DecisionGraph
   └── Seed nodes glow amber
   └── Edges illuminate as they're traversed
   └── Related artifacts fade in
   └── SUPERSEDES chain highlights sequentially
   └── Final path stays illuminated

7. ANSWER APPEARS
   └── Right column: AnswerPanel
   └── Question repeated at top
   └── Final answer text (formatted markdown)
   └── Confidence: "Likely" with animated indicator
   └── Reasoning Summary (expandable)
   └── Supporting Decisions (2 found) (expandable)
   └── Supporting Evidence (4 citations) (expandable)
   └── Missing Evidence: "No experimental validation found" (expandable)

8. EXPLORE
   └── Click a decision node → NodeDetails panel
   └── "Original Hypothesis: Controlled API reduces SSR bugs"
   └── "Alternatives: 3 rejected"
   └── "Trade-offs: 4 identified"
   └── "Version History: 2 versions"
   └── Click evidence link → EvidenceDrawer
   └── Shows: PR #1234 · Excerpt · GitHub URL
   └── Click GitHub URL → opens real PR (only network call in demo)

9. DECISION HISTORY
   └── In NodeDetails, VersionHistory tab
   └── Vertical timeline:
       "Initial Proposal (Mar 2022)" ↓
       "Alternative Rejected (Apr 2022)" ↓
       "Implementation (Jun 2022)" ↓
       "Superseded (Jan 2023)" ↓
       "Current Decision (Mar 2023)"
   └── Each dot is clickable → navigates graph to that version
```

## 9. UI Wireframes (ASCII)

### Landing Page
```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│                                                              │
│                    ╔══════════════════╗                      │
│                    ║  Decision Graph  ║                      │
│                    ╚══════════════════╝                      │
│                                                              │
│          AI that reconstructs why software evolves.          │
│                                                              │
│   Organizations remember code. They forget decisions.        │
│   Decision Graph reconstructs product reasoning from         │
│   engineering evidence.                                      │
│                                                              │
│                                                              │
│     ┌─────────────────────┐  ┌─────────────────────┐        │
│     │  Analyze Repository  │  │    View Demo        │        │
│     └─────────────────────┘  └─────────────────────┘        │
│                                                              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Repository Overview (top section of /demo)
```
┌──────────────────────────────────────────────────────────────┐
│ razorpay/blade · main                                    ○ ● │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌───────┐              │
│ │ 1.2k │ │   89 │ │  312 │ │   47 │ │  86%  │              │
│ │Commits│ │Issues│ │  PRs │ │Decis.│ │Confid.│              │
│ └──────┘ └──────┘ └──────┘ └──────┘ └───────┘              │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │  Ask a question about the repository...          [Ask]   │ │
│ └──────────────────────────────────────────────────────────┘ │
│  Why doesn't Dropdown use native select?  ▼                 │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Reasoning Screen (after query - three column)
```
┌──────────────────────────────────────────────────────────────┐
│ razorpay/blade                                         ○ ●  │
├─────────────────┬──────────────────────┬────────────────────┤
│   DECISION GRAPH│  REASONING TIMELINE  │  ANSWER            │
│                 │                      │                    │
│   ┌─────┐       │  ● Planning...      │  Question:         │
│   │Dec A│       │  ○ Searching graph   │  "Why doesn't      │
│   └──┬──┘       │  ○ Following SUPERS..│   Dropdown use     │
│      │          │  ○ Reading evidence   │   native select?"  │
│   ┌──▼──┐       │  ○ Inspecting Dec..  │                    │
│   │Dec B│       │  ● Confidence up     │  Answer:            │
│   └──┬──┘       │  ○ Generating...     │  The Dropdown      │
│      │          │  ○ Answer complete   │  component chose   │
│   ┌──▼──┐       │                      │  a controlled-only │
│   │PR#42│       │                      │  API because SSR   │
│   └─────┘       │                      │  hydration bugs    │
│                 │                      │  made uncontrolled │
│   ┌─────┐       │                      │  unreliable (PR    │
│   │Iss#9│       │                      │  #1423, Issue #89).│
│   └─────┘       │                      │                    │
│                 │                      │  ○ Confidence:     │
│                 │                      │    likely          │
│                 │                      │  ○ Reasoning (>)   │
│                 │                      │  ○ Decisions (>)   │
│                 │                      │  ○ Evidence (>)    │
└─────────────────┴──────────────────────┴────────────────────┘
```

### Node Details Panel (overlay, right side)
```
┌─────────────────────────────────────┐
│  ×                               │
│                                     │
│  Decision                           │
│  ─────────────────────────          │
│                                     │
│  Dropdown uses controlled-only API  │
│                                     │
│  Status: Adopted · Confidence: high │
│  Decided: Mar 2023                  │
│                                     │
│  Original Hypothesis                │
│  ┌─────────────────────────┐       │
│  │ "Controlled API avoids   │       │
│  │  SSR hydration mismatch  │       │
│  │  by never rendering DOM  │       │
│  │  until client-side init" │       │
│  └─────────────────────────┘       │
│                                     │
│  Alternatives (3)          ▼       │
│  ┌─ Native select                 │
│  │  "Would miss platform-          │
│  │   specific styling"             │
│  ├─ Uncontrolled + ref            │
│  │  "Hydration bugs in            │
│  │   React 17"                     │
│  ├─ Hybrid approach               │
│  │  "Complexity not justified"    │
│  └─                                │
│                                     │
│  Trade-offs (4)           ▼        │
│                                     │
│  Version History                    │
│  ○ Initial Proposal      Mar 2022  │
│  │                                  │
│  ○ Alternative Rejected  Apr 2022  │
│  │                                  │
│  ○ Implementation        Jun 2022  │
│  │                                  │
│  ○ Superseded            Jan 2023  │
│  │                                  │
│  ○ Current Decision      Mar 2023  │
│                                     │
│  Evidence (3)                      │
│  ┌─ PR #1423 ──►                   │
│  ├─ Issue #89 ──►                  │
│  └─ RFC a11y ──►                   │
└─────────────────────────────────────┘
```

### Evidence Drawer
```
┌─────────────────────────────────────┐
│  ×  Evidence                     │
│                                     │
│  ─────────────────────────          │
│                                     │
│  PR #1423                           │
│  "feat(Dropdown): controlled-only   │
│   API"                              │
│                                     │
│  Excerpt                            │
│  ┌─────────────────────────┐       │
│  │ "We chose controlled    │       │
│  │  because uncontrolled   │       │
│  │  causes hydration       │       │
│  │  mismatches in SSR"     │       │
│  └─────────────────────────┘       │
│                                     │
│  View on GitHub ──►                 │
│                                     │
│  Decision Source: Dropdown uses...  │
│  Confidence: high                   │
│  Extracted by: extraction:run_abc   │
└─────────────────────────────────────┘
```

## 10. Implementation Order

Build one feature at a time. Each step produces something visible and testable.

### Phase 1: Scaffold (1 session)
- [ ] Initialize Next.js 15 project with App Router
- [ ] Configure TailwindCSS with dark theme
- [ ] Install deps: reactflow, framer-motion, lucide-react, class-variance-authority, tailwind-merge, clsx
- [ ] Set up shadcn/ui (only the components we use)
- [ ] Create `globals.css` with design tokens
- [ ] Create `lib/types.ts` — frontend type definitions
- [ ] Create `lib/graph-store.ts` — in-memory store
- [ ] Create `lib/utils.ts` — utility functions
- [ ] Set up ThemeProvider

### Phase 2: Landing Page (1 session)
- [ ] Build `Hero.tsx` — centered layout, large title
- [ ] Build `FeatureCards.tsx` — three key differentiators
- [ ] Wire up CTA buttons (Analyze Repository → /demo)
- [ ] Add entry animations (Framer Motion)
- [ ] Deploy demo data files to `public/demo/`

### Phase 3: Repository Overview (1 session)
- [ ] Build `RepoHeader.tsx`
- [ ] Build `RepoStatsGrid.tsx` with count-up animations
- [ ] Build `GraphStats.tsx`
- [ ] Create `DemoContext` and `useDemo.ts`
- [ ] Load and validate graph.json on mount
- [ ] Display stats from graph data

### Phase 4: Query Input (1 session)
- [ ] Build `QueryInput.tsx`
- [ ] Add example questions dropdown
- [ ] Wire up submission (triggers demo replay)
- [ ] Add animated state transitions (idle → thinking)

### Phase 5: Reasoning Timeline (1 session)
- [ ] Build `ReasoningTimeline.tsx`
- [ ] Build `ReasoningEvent.tsx`
- [ ] Create `useReasoningStream.ts` hook
- [ ] Implement demo replay engine in `lib/demo-replay.ts`
- [ ] Create `lib/events.ts` for event type narrowing
- [ ] Animate event entry (staggered slide-up)

### Phase 6: Answer Panel (1 session)
- [ ] Build `AnswerPanel.tsx`
- [ ] Build `ConfidenceIndicator.tsx` with animation
- [ ] Build `ExpandableSection.tsx`
- [ ] Format answer text with markdown
- [ ] Animate section reveal

### Phase 7: Decision Graph — Core (1 session)
- [ ] Build `DecisionGraph.tsx` as React Flow wrapper
- [ ] Create `DecisionNode.tsx` custom renderer
- [ ] Create `ArtifactNode.tsx` custom renderer
- [ ] Create `ComponentNode.tsx` custom renderer
- [ ] Create `AnimatedEdge.tsx` custom edge
- [ ] Implement dagre layout
- [ ] Wire up node/edge highlighting from reasoning stream

### Phase 8: Node Details & Evidence (1 session)
- [ ] Build `NodeDetails.tsx` side panel
- [ ] Build `VersionHistory.tsx` vertical timeline
- [ ] Build `EvidenceDrawer.tsx` slide-over
- [ ] Build `EvidenceCard.tsx`
- [ ] Wire node click → details panel
- [ ] Wire citation click → evidence drawer

### Phase 9: Graph-Stream Integration (1 session)
- [ ] Connect reasoning stream to graph highlighting
- [ ] Seed node animation on traversal start
- [ ] Edge traversal animation (dashed line fill)
- [ ] Visited node glow
- [ ] Fit view on graph update

### Phase 10: Three-Column Layout (1 session)
- [ ] Build `ThreeColumnLayout.tsx`
- [ ] Responsive behavior (columns → stack on narrow)
- [ ] Smooth layout transition (query idle → three columns)
- [ ] Column resize/balance
- [ ] Polish spacing and alignment

### Phase 11: Demo Mode & Polish (1 session)
- [ ] Verify `npm run demo` works end-to-end
- [ ] Tune replay timing
- [ ] Test all example questions
- [ ] Add loading/empty/error states
- [ ] Performance audit (React Flow with ~100 nodes)
- [ ] Dark theme consistency pass
- [ ] TypeScript strict mode compliance

### Phase 12: Animation Pass (1 session)
- [ ] Fine-tune all Framer Motion animations
- [ ] Add page transition between `/` and `/demo`
- [ ] Polish graph node/edge animations
- [ ] Add subtle ambient effects (gradient shifts, subtle pulses)
- [ ] Test on projector / external display (demo readiness)

---

## Type Definitions (lib/types.ts)

The frontend maintains its own type definitions that mirror the backend's domain types but are fully independent:

```typescript
// Node types
type NodeType = "decision" | "component" | "actor" | "issue" | "pull_request" | "commit" | "document" | "experiment" | "metric" | "question" | "feature" | "version";

// Edge types
type EdgeType = "SUPPORTED_BY" | "IMPLEMENTS" | "SUPERSEDES" | "PROPOSED_IN" | "DISCUSSED_IN" | "REJECTED_ALTERNATIVE" | "VALIDATED_BY" | "AFFECTS" | "OWNED_BY" | "REFERENCES" | "GENERATED_FROM" | "INFORMS";

// Core graph types
interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  data: unknown;
  confidence: "high" | "medium" | "low" | null;
  provenance: { source: string; origin: string; url?: string };
  createdAt: string;
  updatedAt: string;
  version: number;
}

interface GraphEdge {
  id: string;
  type: EdgeType;
  from: string;
  to: string;
  confidence: "high" | "medium" | "low" | null;
  provenance: { source: string; origin: string; url?: string };
  rationale?: string;
  createdAt: string;
}

// Decision object (from decision node data)
interface DecisionObject {
  id: string;
  title: string;
  scope: { component: string; area?: string };
  status: "adopted" | "superseded" | "revisited";
  hypothesis: string;
  context: string;
  alternatives: { option: string; reasonRejected: string; evidenceIds: string[] }[];
  chosenSolution: string;
  tradeOffs: string[];
  evidence: { id: string; kind: string; url: string; title: string; excerpt: string; date?: string }[];
  expectedOutcome?: string;
  observedOutcome: string | null;
  confidence: "high" | "medium" | "low";
  confidenceRationale: string;
  actors: string[];
  decidedAt?: string;
  extraction: { runId: string; model: string; toolCalls: number; ts: string };
}

// Run events (for reasoning timeline)
type RunEvent =
  | { t: "run_started"; runId: string; component: string; model: string; ts: string }
  | { t: "phase"; name: string; ts: string }
  | { t: "tool_call"; seq: number; name: string; input: unknown; ts: string }
  | { t: "tool_result"; seq: number; summary: string; bytes: number; isError: boolean; ts: string }
  | { t: "guard_hit"; path: string; ts: string }
  | { t: "decision_emitted"; decisionId: string; title: string; confidence: string; ts: string }
  | { t: "decision_rejected"; errors: string[]; ts: string }
  | { t: "assistant_text"; text: string; ts: string }
  | { t: "run_finished"; status: string; stats: Record<string, unknown>; ts: string };

// Answer types
type Certainty = "unknown" | "possible" | "likely" | "known";

interface Answer {
  answer: string;
  certainty: Certainty;
  supportingDecisionIds: string[];
  supportingEvidenceUrls: string[];
  missingEvidence: string | null;
  reasoningSummary: string;
}

interface ReasoningTrace {
  question: string;
  intent: string;
  matchedRule: string;
  seedIds: string[];
  visitedNodeIds: string[];
  contextTokens: number;
  proposedCertainty: Certainty;
  certaintyCeiling: Certainty;
  certaintyDowngraded: boolean;
  rejectedCitations: string[];
}

interface AnsweredQuestion {
  answer: Answer;
  trace: ReasoningTrace;
  plan: { intent: string; matchedRule: string; emphasis: string };
}

// Repo statistics
interface RepoStats {
  repo: string;
  branch: string;
  commitCount: number;
  issueCount: number;
  prCount: number;
  decisionCount: number;
  evidenceCount: number;
  nodeCount: number;
  edgeCount: number;
  extractionConfidence: number;
  evaluationSummary?: {
    precision: number;
    recall: number;
    f1: number;
  };
}
```
