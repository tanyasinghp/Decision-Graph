# Decision Graph — Phase 1 Architecture
**Scope:** Backend pipeline only. Raw GitHub evidence → validated Decision Objects → persisted graph → evaluation report.
**Status:** Awaiting approval before implementation.

---

## Engineering challenges to the spec (read first)

Three implementation details I'm changing, with reasons. Product vision untouched.

**C1 — Next.js is deferred to Phase 2; Phase 1 is a framework-agnostic TypeScript package.**
Long-running agent loops (2–10 min per component) don't belong in Next.js route handlers — you'd fight serverless timeouts and lose nothing by waiting. Phase 1 builds `src/` (pure lib) + `scripts/` (CLI entrypoints) with zero framework imports. In Phase 2, Next.js API routes become thin adapters over the same lib. This is *more* Clean Architecture, not less: the core never knows how it's invoked.

**C2 — Every agent run persists a replayable event log.**
Not in your requirements list, but it's the cheapest high-value addition in the whole system: every tool call, result, and emission appended to `data/runs/<runId>.jsonl`. It gives us (a) deterministic demo replay for the Phase 2 trace UI with zero extra work, (b) debuggability of extraction quality, (c) an audit trail — "explainability" made concrete. Cost: ~30 lines.

**C3 — `create_edge` between decisions runs as a second pass, not mid-extraction.**
Cross-decision edges (`SUPERSEDES`, `INFORMS`) need visibility over *all* of a component's decisions. During extraction Claude emits decisions one at a time; letting it link mid-stream produces edges against decisions that don't exist yet. So: extraction pass emits decisions + evidence-edges (`SUPPORTED_BY`, `IMPLEMENTED_BY`, `REJECTED_ALTERNATIVE`, `MADE_BY` — all derivable from a single decision), then a linking pass gets the full decision set and proposes only cross-decision edges. Same tools, correct information availability.

---

## 1. Folder structure

```
decision-graph/
├── package.json               # tsx for scripts, vitest for tests
├── tsconfig.json
├── .env.example               # ANTHROPIC_API_KEY, GITHUB_TOKEN
├── src/
│   ├── domain/                     # ← zero dependencies, pure types
│   │   ├── schemas.ts              # all Zod schemas (single source of truth)
│   │   ├── types.ts                # inferred TS types + type guards
│   │   └── errors.ts               # typed error hierarchy
│   ├── evidence/                   # ← evidence acquisition & access
│   │   ├── EvidenceSource.ts       # interface (port)
│   │   ├── GitHubFetcher.ts        # octokit → raw JSON (prefetch only)
│   │   ├── CachedEvidenceSource.ts # reads data/cache (used by agent)
│   │   ├── EvidenceIndex.ts        # in-memory keyword index for search_items
│   │   └── guards.ts               # PATH DENY-LIST: _decisions/** blocked here
│   ├── agent/
│   │   ├── ExtractionAgent.ts      # the tool-use loop (extraction pass)
│   │   ├── LinkingAgent.ts         # second pass: cross-decision edges
│   │   ├── tools.ts                # tool defs (from Zod) + dispatch table
│   │   ├── prompts.ts              # system prompts, isolated for iteration
│   │   └── RunLog.ts               # JSONL event log writer (C2)
│   ├── graph/
│   │   ├── GraphStore.ts           # interface (port)
│   │   ├── JsonGraphStore.ts       # data/graph.json impl, atomic writes
│   │   └── traverse.ts             # neighbors/paths/chains (for Phase 2 UI)
│   ├── validation/
│   │   ├── GroundTruth.ts          # loads data/ground-truth (fetched separately)
│   │   ├── Validator.ts            # Claude-as-judge matching
│   │   └── report.ts               # matched/missed/novel + confidence report
│   └── llm/
│       ├── LlmClient.ts            # interface (port) — thin, messages+tools
│       └── AnthropicClient.ts      # SDK adapter, retries, token accounting
├── scripts/                        # composition roots (DI happens HERE only)
│   ├── prefetch.ts                 # --repo razorpay/blade --component Dropdown
│   ├── fetch-ground-truth.ts       # separate on purpose (see §guards)
│   ├── extract.ts                  # --component Dropdown [--budget 25]
│   ├── link.ts                     # cross-decision linking pass
│   ├── validate.ts                 # --component Dropdown → report
│   └── stats.ts                    # graph summary, token/cost totals
├── data/
│   ├── cache/<owner>__<repo>/<component>/   # issues.json, prs.json, commits.json, tree.json, files/
│   ├── ground-truth/<owner>__<repo>/        # _decisions docs — NEVER on agent's path
│   ├── graph.json
│   ├── runs/<runId>.jsonl
│   └── reports/<component>.validation.json
└── tests/
    ├── guards.test.ts              # THE test: agent cannot reach _decisions
    ├── schemas.test.ts             # emit_decision rejection cases
    └── graph.test.ts               # store + traversal invariants
```

Dependency rule (enforced by import direction): `domain` ← everything; `evidence`/`graph`/`llm` ← `agent`/`validation` ← `scripts`. Nothing imports from `scripts`. No DI container — constructor injection wired in composition roots. Interfaces exist only where a second implementation is *plausible* (evidence source: live vs cached; graph store: JSON vs DB; LLM: real vs recorded-for-tests). Nothing else gets one.

## 2. Module dependency diagram

```
                 ┌────────────┐
                 │   domain    │  (schemas, types, errors)
                 └──────▲──────┘
        ┌───────────────┼────────────────┐
   ┌────┴────┐    ┌─────┴─────┐    ┌─────┴────┐
   │evidence │    │   graph   │    │   llm    │
   └────▲────┘    └─────▲─────┘    └────▲─────┘
        │               │               │
        └───────┬───────┴───────┬───────┘
           ┌────┴─────┐   ┌─────┴─────┐
           │  agent   │   │validation │ (validation also reads graph + llm)
           └────▲─────┘   └─────▲─────┘
                └───────┬───────┘
                  ┌─────┴─────┐
                  │  scripts  │  (composition roots / DI)
                  └───────────┘
```

## 3. Interfaces (the ports)

```typescript
// evidence/EvidenceSource.ts — what the agent's tools see
interface EvidenceSource {
  searchItems(q: SearchQuery): Promise<SearchHit[]>;          // keyword over titles+bodies+comments
  readIssue(n: number): Promise<IssueThread>;                 // body + full comment thread
  readPr(n: number): Promise<PrThread>;                       // body + comments + review comments + files touched
  readCommit(sha: string): Promise<CommitInfo>;
  readFile(path: string): Promise<FileContent>;               // throws ForbiddenPathError on deny-list
  listDirectory(path: string): Promise<DirEntry[]>;           // deny-listed entries omitted entirely
}

// graph/GraphStore.ts
interface GraphStore {
  addNode(node: GraphNode): void;                             // idempotent by id
  addEdge(edge: GraphEdge): void;                             // validates endpoint existence + edge-type endpoint kinds
  getNode(id: string): GraphNode | undefined;
  neighbors(id: string, opts?: { edgeType?: EdgeType; direction?: "in" | "out" }): GraphNode[];
  chain(id: string, edgeType: EdgeType): GraphNode[];         // e.g. full SUPERSEDES lineage
  query(filter: NodeFilter): GraphNode[];
  flush(): Promise<void>;                                     // atomic write (tmp + rename)
}

// llm/LlmClient.ts — deliberately thin; no SDK types leak upward
interface LlmClient {
  createMessage(req: {
    system: string;
    messages: LlmMessage[];
    tools: ToolDef[];
    maxTokens: number;
    temperature: number;                                      // 0 for extraction
  }): Promise<LlmResponse>;                                   // handles 429/529 retry w/ backoff internally
}

// agent/ExtractionAgent.ts
class ExtractionAgent {
  constructor(deps: { evidence: EvidenceSource; graph: GraphStore; llm: LlmClient; log: RunLog; config: AgentConfig });
  run(component: string): Promise<ExtractionResult>;          // { runId, decisions, toolCalls, tokens, cost }
}
```

## 4. Data flow

```
 GitHub API ──(prefetch.ts, octokit, once)──► data/cache/…            ┐ acquisition
 GitHub API ──(fetch-ground-truth.ts, once)─► data/ground-truth/…     ┘ (separate scripts,
                                                                         separate dirs)
 data/cache ──► EvidenceIndex ──► tools ◄──► ExtractionAgent ◄──► AnthropicClient
                    (guards.ts deny-list sits inside readFile/listDirectory/search)
 ExtractionAgent ──emit_decision──► schema gate ──► GraphStore ──► data/graph.json
                 └──every event──► RunLog ──► data/runs/<runId>.jsonl
 graph.json + LinkingAgent ──create_edge──► cross-decision edges ──► graph.json
 graph.json + data/ground-truth ──► Validator (Claude-as-judge) ──► data/reports/…
```

The prefetch/extract boundary is absolute: `ExtractionAgent` has no code path to the network. `GitHubFetcher` is imported only by the two acquisition scripts.

## 5. Module responsibilities

| Module | Owns | Explicitly does NOT |
|---|---|---|
| `domain/schemas.ts` | Every Zod schema; single source for tool JSON-schemas, runtime validation, TS types | logic of any kind |
| `evidence/GitHubFetcher` | Pagination, rate-limit respect, normalizing GitHub API shapes → cache format | being available at extraction time |
| `evidence/CachedEvidenceSource` | Serving evidence from disk; consulting `guards.ts` on every path-touching call | network access |
| `evidence/EvidenceIndex` | Keyword search (lowercased token match + simple ranking) over cached items | embeddings (deferred deliberately) |
| `evidence/guards.ts` | The `_decisions` deny-list (`**/_decisions/**`, configurable). One choke point, unit-tested | trusting the prompt to enforce this |
| `agent/ExtractionAgent` | The loop: budget, message accumulation, tool dispatch, emission handling, stop conditions | traversal strategy (Claude's job), edge types beyond per-decision |
| `agent/LinkingAgent` | Cross-decision `SUPERSEDES`/`INFORMS` given full decision set | re-reading raw evidence beyond decisions' stored excerpts |
| `agent/tools.ts` | ToolDef generation from Zod, dispatch table, tool-result truncation limits | business logic (delegates to EvidenceSource/GraphStore) |
| `agent/RunLog` | Append-only JSONL: `run_started`, `tool_call`, `tool_result`, `decision_emitted`, `decision_rejected`, `run_finished` | interpretation |
| `graph/JsonGraphStore` | Nodes/edges, id-idempotency, endpoint-kind validation per edge type, atomic flush | graph algorithms |
| `graph/traverse.ts` | `neighbors`, `chain`, `pathsBetween` — Phase 2 UI reads these | mutation |
| `validation/Validator` | Pairing extracted vs ground-truth decisions via Claude judge; scoring | fixing the extractor |
| `llm/AnthropicClient` | SDK calls, exponential backoff, token/cost accounting per run | prompt content |

## 6. Sequence diagram — one extraction run

```
 extract.ts        ExtractionAgent      tools/dispatch     CachedEvidenceSource   AnthropicClient   GraphStore   RunLog
     │ wire deps        │                     │                    │                    │               │           │
     ├───run("Dropdown")►                     │                    │                    │               │           │
     │                  ├─ run_started ───────┼────────────────────┼────────────────────┼───────────────┼──────────►│
     │                  ├─ createMessage(system, tools) ───────────┼───────────────────►│               │           │
     │                  │◄─ tool_use: search_items("Dropdown") ────┼────────────────────┤               │           │
     │                  ├────────────────────►│ searchItems ──────►│                    │               │           │
     │                  │◄─ hits (ranked, truncated) ──────────────┤                    │               │           │
     │                  ├─ tool_call+result ──┼────────────────────┼────────────────────┼───────────────┼──────────►│
     │                  ├─ createMessage(+tool_result) ────────────┼───────────────────►│               │           │
     │                  │◄─ tool_use: read_pr(1234) …              │                    │               │           │
     │                  │   … loop: read_issue / read_file(rfcs/…) / read_commit …      │               │           │
     │                  │   [read_file("…/_decisions/…") → ForbiddenPathError → returned│               │           │
     │                  │    to Claude as tool error; logged as guard_hit]              │               │           │
     │                  │◄─ tool_use: emit_decision({...}) ────────┼────────────────────┤               │           │
     │                  ├─ Zod parse ─ evidence gate (≥1 evidence w/ url+excerpt) ─┐    │               │           │
     │                  │   ok → addNode(Decision, Evidence…) + per-decision edges ─┼───┼──────────────►│           │
     │                  │   fail → tool_result: validation errors (Claude retries) ─┘   │               │           │
     │                  │   … until Claude stops calling tools OR budget exhausted …    │               │           │
     │                  ├─ flush() ───────────┼────────────────────┼────────────────────┼──────────────►│           │
     │◄─ ExtractionResult { runId, decisions, tokens, cost } ──────┤                    │               │           │
```

Stop conditions (explicit, in order): Claude returns no tool call → done; tool budget hit → final "synthesize what you have now, emit remaining decisions" message → done; hard turn cap → abort with partial results, run marked `truncated`.

## 7. API contracts (Phase 1 = CLI; shapes are the future HTTP contracts)

```bash
tsx scripts/prefetch.ts --repo razorpay/blade --component Dropdown [--component ...]
tsx scripts/fetch-ground-truth.ts --repo razorpay/blade
tsx scripts/extract.ts --component Dropdown [--budget 25] [--model claude-sonnet-4-5]
tsx scripts/link.ts
tsx scripts/validate.ts --component Dropdown
tsx scripts/stats.ts
```

```typescript
// extract.ts result (→ Phase 2: POST /api/extract, same events over SSE)
type ExtractionResult = {
  runId: string; component: string;
  decisions: DecisionObject[];
  stats: { toolCalls: number; guardHits: number; inputTokens: number; outputTokens: number; costUsd: number; durationMs: number };
  status: "completed" | "truncated";
};

// RunLog event (JSONL lines; → Phase 2 SSE frames, unchanged)
type RunEvent =
  | { t: "run_started"; runId: string; component: string; model: string; ts: string }
  | { t: "tool_call"; name: string; input: unknown; seq: number; ts: string }
  | { t: "tool_result"; seq: number; summary: string; bytes: number; ts: string }
  | { t: "guard_hit"; path: string; ts: string }
  | { t: "decision_emitted"; decisionId: string; title: string; confidence: string; ts: string }
  | { t: "decision_rejected"; errors: string[]; ts: string }
  | { t: "run_finished"; status: string; stats: object; ts: string };

// validate.ts report (→ Phase 2: GET /api/validation)
type ValidationReport = {
  component: string;
  matched: { extractedId: string; groundTruthRef: string; judgeRationale: string; overlap: "full" | "partial" }[];
  missed:  { groundTruthRef: string; summary: string }[];
  novel:   { extractedId: string; title: string; confidence: string }[];
  confidenceCalibration: { high: MatchRate; medium: MatchRate; low: MatchRate };  // are high-conf decisions actually matched more often?
};
```

## 8. Zod schemas (domain/schemas.ts — authoritative)

```typescript
import { z } from "zod";

export const EvidenceKind = z.enum(["pr", "issue", "discussion", "commit", "rfc", "doc"]);

export const EvidenceSchema = z.object({
  id: z.string(),                       // "pr-1234", "commit-ab12ef", "rfc-2022-04-09-accessibility"
  kind: EvidenceKind,
  url: z.string().url().refine(u => u.startsWith("https://github.com/"), "must be a real GitHub URL"),
  title: z.string().min(1),
  excerpt: z.string().min(20).max(1500), // verbatim quote — the faithfulness anchor
  date: z.string().optional(),
});

export const AlternativeSchema = z.object({
  option: z.string().min(1),
  reasonRejected: z.string().min(1),
  evidenceIds: z.array(z.string()),      // empty allowed → UI renders "inferred"
});

export const Confidence = z.enum(["high", "medium", "low"]);

export const DecisionInputSchema = z.object({   // what emit_decision accepts
  title: z.string().min(8).max(160),
  scope: z.object({ component: z.string(), area: z.string().optional() }),
  status: z.enum(["adopted", "superseded", "revisited"]),
  hypothesis: z.string().min(20),
  context: z.string().min(20),
  alternatives: z.array(AlternativeSchema),
  chosenSolution: z.string().min(20),
  tradeOffs: z.array(z.string()),
  evidence: z.array(EvidenceSchema).min(1),     // ← THE GATE: no evidence, no decision
  expectedOutcome: z.string().optional(),
  observedOutcome: z.string().nullable(),        // null = "no follow-up evidence found" — honest
  confidence: Confidence,
  confidenceRationale: z.string().min(10),       // forces Claude to justify the grade
  actors: z.array(z.string()),
  decidedAt: z.string().optional(),
});
// Server-side additions (never Claude-supplied): id, extraction: { runId, model, toolCalls, ts }
export const DecisionObjectSchema = DecisionInputSchema.extend({
  id: z.string(),
  extraction: z.object({ runId: z.string(), model: z.string(), toolCalls: z.number(), ts: z.string() }),
});

export const NodeKind = z.enum(["decision", "evidence", "component", "actor"]);
export const EdgeType = z.enum([
  "SUPPORTED_BY", "IMPLEMENTED_BY", "REJECTED_ALTERNATIVE", "MADE_BY",  // extraction pass
  "SUPERSEDES", "INFORMS",                                              // linking pass
  "DECIDES",                                                            // decision → component (implicit, added by store)
]);

export const GraphNodeSchema = z.object({
  id: z.string(), kind: NodeKind,
  data: z.union([DecisionObjectSchema, EvidenceSchema,
    z.object({ name: z.string() }),          // component
    z.object({ login: z.string() })]),       // actor
});

export const GraphEdgeSchema = z.object({
  id: z.string(), type: EdgeType,
  from: z.string(), to: z.string(),
  rationale: z.string().optional(),           // required for SUPERSEDES/INFORMS (checked by linker)
  evidenceIds: z.array(z.string()).optional(),
});

// Edge endpoint-kind rules enforced by JsonGraphStore.addEdge:
//   SUPPORTED_BY/IMPLEMENTED_BY/REJECTED_ALTERNATIVE: decision → evidence
//   MADE_BY: decision → actor · DECIDES: decision → component
//   SUPERSEDES/INFORMS: decision → decision
```

Tool input schemas (`search_items`, `read_pr`, …) are trivial wrappers (number/string params) also defined here; `emit_decision`'s tool schema *is* `DecisionInputSchema` via `zod-to-json-schema` — one definition serves the API tool contract, runtime gate, and TS types. That's the "faithfulness by types" story.

## 9. Implementation risks

1. **Extraction quality (product risk #1).** Mitigation: prompts isolated in `prompts.ts` for fast iteration; run-log makes failures inspectable; iterate on ONE component before scaling; evidence gate converts hallucination into visible rejection events rather than silent bad data.
2. **Context window blowout** — a 100-comment PR thread can be 50k+ tokens; several reads → overflow mid-run. Mitigation: per-tool-result truncation caps (e.g. `read_pr` returns top-level body + comments capped at N chars each with `[truncated — re-read with ?full=true]` marker); running token estimate in the loop; budget warning injected at 80%.
3. **Prefetch completeness vs rate limits** — comments require per-item calls (1 PR = 1–3 calls). Mitigation: component-scoped prefetch (search-first, then hydrate only matched items), cache is resumable/idempotent, GraphQL fallback if REST call-count hurts.
4. **Claude ignores or games the evidence gate** (e.g. duplicate flimsy excerpts). Mitigation: gate errors are returned as tool results so it self-corrects; excerpt min-length; validator cross-checks excerpts appear in cached source (cheap string containment check — catches fabricated quotes mechanically, no LLM needed).
5. **Ground-truth leakage** — the demo's credibility depends on it. Mitigation: deny-list in one tested choke point; ground truth in a directory the EvidenceSource can't even list; `guards.test.ts` proves it; `guard_hit` events prove it *live* if Claude ever tries.
6. **Claude-as-judge validation is itself fallible.** Mitigation: judge outputs rationale per match (inspectable); manual spot-check of one component's report; framed in demo as "assisted evaluation," not oracle.
7. **Non-determinism.** Temperature 0 + cached evidence + logged runs = reproducible *enough*; the demo replays a logged run, so on-stage determinism is absolute.

## 10. Ordered implementation checklist

Sequenced so every step is testable against real data before the next begins. Modules 4–5 are the critical path; everything before exists to make them debuggable.

- [ ] **M1 — Scaffold + domain** (~45 min): package.json (tsx, zod, octokit, @anthropic-ai/sdk, vitest), tsconfig, `domain/` complete, `schemas.test.ts` (accept/reject cases for `DecisionInputSchema`)
- [ ] **M2 — Prefetch + cache** (~2 h): `GitHubFetcher`, `prefetch.ts`, `fetch-ground-truth.ts`; run for real: 2 blade components cached, ground truth stashed
- [ ] **M3 — Evidence access + guards** (~1.5 h): `CachedEvidenceSource`, `EvidenceIndex`, `guards.ts`, `guards.test.ts` green
- [ ] **M4 — Agent loop + tools** (~3 h, the core): `tools.ts`, `RunLog`, `AnthropicClient`, `ExtractionAgent`, `extract.ts`; first real extraction on one component
- [ ] **M5 — Prompt iteration** (~2 h, timeboxed): inspect run logs + decisions, refine `prompts.ts` until output quality is demo-grade on that component
- [ ] **M6 — Graph store + linking** (~1.5 h): `JsonGraphStore`, `traverse.ts`, `LinkingAgent`, `link.ts`, `graph.test.ts`
- [ ] **M7 — Validation** (~1.5 h): `GroundTruth`, `Validator` (judge prompt), excerpt-containment check, `validate.ts`, report for component #1
- [ ] **M8 — Scale + harden** (~1 h): extract remaining components, `stats.ts`, review reports, tag best demo stories

Total ≈ 13.5 h — fits Day 1 + Day 2 morning, leaving Day 2 afternoon for Phase 2 (UI), per the build spec.

**Gate per module (per your process):** after each module I explain design decisions + trade-offs and wait for your confirmation before the next.
