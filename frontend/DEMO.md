# Decision Graph — Demo Guide

## Getting Started

```bash
# Install dependencies
cd frontend
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

Open [http://localhost:3000](http://localhost:3000) to see the landing page. Click **Launch Demo** to enter the demo.

---

## Demo Structure

### Landing Page (`/`)

- Title: "Decision Graph"
- Subtitle: "Reconstructing Why from Ship"
- Two CTAs: "Launch Demo" and "View on GitHub"

### Demo Page (`/demo`)

The demo page has four main areas:

1. **Controls Bar** — Question selector dropdown, Play/Stop button, progress bar with percentage, speed selector (0.5x/1x/2x), Reset button
2. **Left Panel** — Decision Graph visualization (React Flow with dagre layout)
3. **Center Panel** — Reasoning Timeline (replay mode) or Counterfactual analysis (counterfactual mode)
4. **Right Panel** — Answer Panel (replay mode) or info message (counterfactual mode)
5. **Evidence Drawer** — Slide-over panel accessible during/after replay

---

## Demo Questions

### Replay Questions (4)

These questions run the full reasoning replay:

| Question | Run File | Expected Answer |
|----------|----------|-----------------|
| Why doesn't Dropdown use a native `<select>`? | `dropdown-hero.jsonl` | SSR hydration bugs made uncontrolled inputs unreliable (Issue #89). The team chose controlled-only API (PR #1423). Accessibility v2 API designed around this constraint. |
| How did the Alert component evolve? | `alert-evolution.jsonl` | Alert evolved from boolean props → named action slots (v2) → compound component API (v3). The slot pattern didn't scale to new features like custom icons and collapsible content. |

### Counterfactual Scenarios (2)

These run the counterfactual engine directly (no replay):

| Question | Scenario |
|----------|----------|
| What if the Dropdown controlled-only API were reverted? | Traces 5 consequences across 2 downstream decisions, 1 component, 5 evidence items |
| What if Alert action slots were kept instead of v3? | Traces 3 consequences across the Alert component |

---

## Demo Walkthrough

### 1. Start a Query

1. Select a question from the dropdown
2. Click **Play**
3. The graph canvas fades in, the timeline starts streaming, and the answer panel populates

### 2. During Replay

- **Graph**: Nodes and edges highlight as the system "reasons" through them. The camera auto-focuses on relevant nodes.
- **Timeline**: Events stream in with type-specific icons and colors. Phases (PLANNING, TRAVERSAL, REASONING, SYNTHESIS) are visually marked.
- **Confidence**: The confidence bar in the Answer Panel evolves from 30% to the final certainty level using an easeOutCubic curve.
- **Evidence**: As decisions are found, evidence cards populate the Evidence Drawer automatically.

### 3. After Replay

- **Evidence Drawer**: Open it via the button in the Answer Panel (or it auto-opens). See each evidence item with its excerpt, confidence badge, provenance chain, and "View on GitHub" link.
- **Missing Evidence**: The drawer shows a "Missing Evidence" section with suggestions for improvement.
- **Graph Exploration**: Click any node to see its details. Hover over evidence items to highlight their associated graph nodes.

### 4. Counterfactual Mode

1. Select a counterfactual question
2. The Counterfactual Panel shows four animated sections:
   - **Observed Reality**: The actual graph state before the hypothetical change
   - **Hypothetical Changes**: What would be different
   - **Predicted Consequences**: Cascading effects through the dependency graph
   - **Confidence**: How certain the system is about these predictions
3. Hypothetical nodes render with dashed purple borders; predicted nodes with dashed orange borders

---

## Controls Reference

| Control | Action |
|---------|--------|
| Play | Start/restart the replay |
| Stop | Pause the current replay |
| Speed 0.5x/1x/2x | Adjust playback speed (disabled during replay) |
| Reset | Return to initial state |
| Progress bar | Shows completion percentage |
| Question selector | Choose a query to run |

---

## Data Files

All demo data is in `frontend/public/demo/`:

```
public/demo/
├── examples.json        — 6 demo questions (4 replay, 2 counterfactual)
├── graph.json           — 12 nodes, 15 edges
└── runs/
    ├── alert-evolution.jsonl     — Alert component evolution replay
    └── dropdown-hero.jsonl       — Dropdown hero moment replay
```

---

## Bundle Size Budget

| Asset | Size |
|-------|------|
| Landing page (`/`) | 1.42 kB + 102 kB shared |
| Demo page (`/demo`) | 85 kB + 102 kB shared |
| **First Load JS** | **102 kB shared** |
| Total static assets | ~44 kB (JSON data) |

---

## Keyboard Shortcuts

*(Future: Space to play/pause, left/right arrows for speed)*
