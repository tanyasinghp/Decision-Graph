/**
 * tests/graph.test.ts — construction, dedup, provenance, determinism,
 * incremental updates, versioning/history, traversal, context builder,
 * exports, and the linking agent's cycle gate.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonGraphStore } from "@dg/engine/graph/GraphStore.js";
import { buildGraph } from "@dg/engine/graph/GraphBuilder.js";
import { GraphTraversal } from "@dg/engine/graph/traverse.js";
import { ContextBuilder } from "@dg/engine/graph/ContextBuilder.js";
import { toGraphML, toMermaid } from "@dg/engine/graph/export.js";
import { GraphIntegrityError } from "@dg/domain/errors.js";
import { idFor } from "@dg/domain/graph.js";
import type { DecisionObject } from "@dg/domain/types.js";

const REPO = "o/r";
let tmp: string;
let tick: number;
const fixedClock = (): string => `2026-01-01T00:00:${String(tick++ % 60).padStart(2, "0")}Z`;
const constClock = (): string => "2026-01-01T00:00:00Z";

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dg-graph-"));
  tick = 0;
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

function mkDecision(over: Partial<DecisionObject> = {}): DecisionObject {
  return {
    id: "dec-dropdown-1",
    title: "Dropdown exposes a controlled-only selection API",
    scope: { component: "Dropdown" },
    status: "adopted",
    hypothesis: "Controlled-only state avoids SSR hydration mismatches entirely.",
    context: "Recurring hydration bugs with uncontrolled state broke checkout.",
    alternatives: [{ option: "dual mode", reasonRejected: "doubles surface", evidenceIds: ["issue-7"] }],
    chosenSolution: "Require value/onChange; drop internal selection state.",
    tradeOffs: ["boilerplate for simple cases"],
    evidence: [
      { id: "pr-42", kind: "pr", url: "https://github.com/o/r/pull/42", title: "controlled API", excerpt: "SSR hydration mismatches kept breaking checkout flows", date: "2023-04-01" },
      { id: "issue-7", kind: "issue", url: "https://github.com/o/r/issues/7", title: "dual mode proposal", excerpt: "we could support both controlled and uncontrolled modes", date: "2023-03-20" },
      { id: "rfc-1", kind: "rfc", url: "https://github.com/o/r/blob/master/rfcs/dropdown.md", title: "dropdown rfc", excerpt: "this RFC proposes the controlled-only selection model", date: "2023-03-01" },
    ],
    observedOutcome: null,
    confidence: "high",
    confidenceRationale: "explicit PR discussion",
    actors: ["alice", "bob"],
    decidedAt: "2023-04-01",
    extraction: { runId: "run-1", model: "m", toolCalls: 10, ts: "2026-01-01" },
    ...over,
  };
}

function populate(store: JsonGraphStore, decisions: DecisionObject[]): void {
  const { nodes, edges } = buildGraph(REPO, decisions);
  for (const n of nodes) store.upsertNode(n);
  for (const e of edges) store.addEdge(e);
}

describe("Graph construction", () => {
  it("builds typed artifact nodes and both uniform + semantic edges", () => {
    const store = new JsonGraphStore(tmp, REPO, fixedClock);
    populate(store, [mkDecision()]);

    expect(store.nodes({ type: "decision" })).toHaveLength(1);
    expect(store.nodes({ type: "pull_request" })).toHaveLength(1);
    expect(store.nodes({ type: "issue" })).toHaveLength(1);
    expect(store.nodes({ type: "document" })).toHaveLength(1);
    expect(store.nodes({ type: "actor" })).toHaveLength(2);
    expect(store.nodes({ type: "component" })).toHaveLength(1);

    const decisionId = store.nodes({ type: "decision" })[0]!.id;
    expect(store.edges({ type: "SUPPORTED_BY", from: decisionId })).toHaveLength(2); // pr + rfc
    expect(store.edges({ type: "REJECTED_ALTERNATIVE", from: decisionId })).toHaveLength(1); // issue-7
    expect(store.edges({ type: "IMPLEMENTS", to: decisionId })).toHaveLength(1); // pr → decision
    expect(store.edges({ type: "PROPOSED_IN", from: decisionId })).toHaveLength(1); // rfc
    expect(store.edges({ type: "AFFECTS", from: decisionId })).toHaveLength(1);
    expect(store.edges({ type: "OWNED_BY", from: decisionId })).toHaveLength(2);
  });

  it("preserves provenance and excerpt on evidence edges", () => {
    const store = new JsonGraphStore(tmp, REPO, fixedClock);
    populate(store, [mkDecision()]);
    const e = store.edges({ type: "SUPPORTED_BY" }).find((x) => x.to.startsWith("pull_request:"));
    expect(e?.provenance).toMatchObject({ source: "github", origin: "extraction:run-1", url: "https://github.com/o/r/pull/42" });
    expect(e?.rationale).toContain("SSR hydration mismatches");
    expect(e?.confidence).toBe("high");
  });

  it("deduplicates shared artifacts and actors across decisions", () => {
    const d2 = mkDecision({
      id: "dec-dropdown-2", title: "Dropdown virtualizes long option lists",
      evidence: [mkDecision().evidence[0]!], // same PR #42
      alternatives: [], actors: ["alice"],
    });
    const store = new JsonGraphStore(tmp, REPO, fixedClock);
    populate(store, [mkDecision(), d2]);
    expect(store.nodes({ type: "pull_request" })).toHaveLength(1); // merged reference
    expect(store.nodes({ type: "actor" })).toHaveLength(2);        // alice deduped
    expect(store.edges({ type: "SUPPORTED_BY", to: idFor.pullRequest(REPO, 42) })).toHaveLength(2);
  });

  it("is deterministic: same input + same clock → byte-identical graph files", () => {
    for (const dir of ["a", "b"]) {
      tick = 0;
      const store = new JsonGraphStore(path.join(tmp, dir), REPO, fixedClock);
      populate(store, [mkDecision()]);
      store.flush();
    }
    expect(fs.readFileSync(path.join(tmp, "a", "graph.json"), "utf8"))
      .toBe(fs.readFileSync(path.join(tmp, "b", "graph.json"), "utf8"));
  });
});

describe("Incremental updates & versioning", () => {
  it("re-upserting identical content is a no-op (no version bump, no history)", () => {
    const store = new JsonGraphStore(tmp, REPO, constClock);
    populate(store, [mkDecision()]);
    populate(store, [mkDecision()]); // second run, identical evidence
    const d = store.nodes({ type: "decision" })[0]!;
    expect(d.version).toBe(1);
    expect(store.nodeHistory(d.id)).toHaveLength(0);
    expect(store.nodes({ type: "decision" })).toHaveLength(1); // never duplicated
  });

  it("changed content bumps version, preserves createdAt, archives prior snapshot", () => {
    const store = new JsonGraphStore(tmp, REPO, fixedClock);
    populate(store, [mkDecision()]);
    const before = store.nodes({ type: "decision" })[0]!;
    populate(store, [mkDecision({ observedOutcome: "hydration bug reports dropped to zero" })]);
    const after = store.nodes({ type: "decision" })[0]!;
    expect(after.version).toBe(2);
    expect(after.createdAt).toBe(before.createdAt);
    const history = store.nodeHistory(after.id);
    expect(history).toHaveLength(1);
    expect(history[0]?.version).toBe(1);
  });

  it("rejects edges violating endpoint rules and SUPERSEDES cycles", () => {
    const store = new JsonGraphStore(tmp, REPO, fixedClock);
    const d1 = mkDecision();
    const d2 = mkDecision({ id: "dec-dropdown-2", title: "Dropdown supports uncontrolled quick mode", status: "adopted" });
    populate(store, [d1, d2]);
    const [a, b] = store.nodes({ type: "decision" }).map((n) => n.id);
    const prov = { source: "internal" as const, origin: "test" };

    // endpoint violation: SUPERSEDES to a component
    expect(() =>
      store.addEdge({ type: "SUPERSEDES", from: a!, to: idFor.component(REPO, "Dropdown"), confidence: "medium", provenance: prov })
    ).toThrow(GraphIntegrityError);

    store.addEdge({ type: "SUPERSEDES", from: b!, to: a!, confidence: "medium", provenance: prov });
    expect(() =>
      store.addEdge({ type: "SUPERSEDES", from: a!, to: b!, confidence: "medium", provenance: prov })
    ).toThrow(/cycle/);
  });
});

describe("Traversal engine", () => {
  function chainStore(): { store: JsonGraphStore; ids: string[] } {
    const store = new JsonGraphStore(tmp, REPO, fixedClock);
    const gen1 = mkDecision({ id: "d1", title: "Dropdown uses native select element", status: "superseded", decidedAt: "2021-01-01" });
    const gen2 = mkDecision({ id: "d2", title: "Dropdown uses custom listbox widget", status: "superseded", decidedAt: "2022-01-01" });
    const gen3 = mkDecision({ id: "d3", title: "Dropdown adopts controlled-only listbox", status: "adopted", decidedAt: "2023-01-01" });
    populate(store, [gen1, gen2, gen3]);
    const ids = store.nodes({ type: "decision" }).map((n) => n.id).sort();
    // Find by title to be robust to slug ordering:
    const byTitle = (frag: string): string => store.nodes({ type: "decision" }).find((n) => n.label.includes(frag))!.id;
    const [i1, i2, i3] = [byTitle("native select"), byTitle("custom listbox"), byTitle("controlled-only")];
    const prov = { source: "internal" as const, origin: "test" };
    store.addEdge({ type: "SUPERSEDES", from: i2, to: i1, confidence: "medium", provenance: prov });
    store.addEdge({ type: "SUPERSEDES", from: i3, to: i2, confidence: "medium", provenance: prov });
    return { store, ids: [i1, i2, i3] };
  }

  it("findDecisionHistory returns the temporal chain oldest → newest", () => {
    const { store, ids } = chainStore();
    const t = new GraphTraversal(store);
    const history = t.findDecisionHistory(ids[1]!); // middle node
    expect(history.map((n) => n.id)).toEqual([ids[0], ids[1], ids[2]]);
  });

  it("ancestors/descendants walk SUPERSEDES transitively", () => {
    const { store, ids } = chainStore();
    const t = new GraphTraversal(store);
    expect(t.findAncestors(ids[2]!).map((h) => h.node.id)).toEqual([ids[1], ids[0]]);
    expect(t.findDescendants(ids[0]!).map((h) => h.node.id)).toEqual([ids[1], ids[2]]);
  });

  it("findDecision ranks lexical matches; findAlternatives/SupportingArtifacts split evidence roles", () => {
    const store = new JsonGraphStore(tmp, REPO, fixedClock);
    populate(store, [mkDecision()]);
    const t = new GraphTraversal(store);
    const hits = t.findDecision("why controlled selection API");
    expect(hits[0]?.label).toContain("controlled-only");
    const id = hits[0]!.id;
    expect(t.findSupportingArtifacts(id)).toHaveLength(2);
    expect(t.findAlternatives(id)).toHaveLength(1);
    expect(t.findAlternatives(id)[0]?.node.type).toBe("issue");
  });

  it("shortestReasoningPath connects two decisions through a shared artifact", () => {
    // Different component + no shared actors: the ONLY connection is PR #42.
    const d2 = mkDecision({
      id: "dec-2", title: "Table virtualizes long lists",
      scope: { component: "Table" },
      evidence: [mkDecision().evidence[0]!], alternatives: [], actors: [],
    });
    const store = new JsonGraphStore(tmp, REPO, fixedClock);
    populate(store, [mkDecision(), d2]);
    const [a, b] = store.nodes({ type: "decision" }).map((n) => n.id);
    const t = new GraphTraversal(store);
    const path_ = t.shortestReasoningPath(a!, b!);
    expect(path_).toBeDefined();
    expect(path_!.length).toBe(5); // decision, edge, artifact, edge, decision
    expect((path_![2] as { id: string }).id).toBe(idFor.pullRequest(REPO, 42));
  });
});

describe("ContextBuilder", () => {
  it("assembles decisions, evidence excerpts, chains and honest nulls; respects budget", () => {
    const store = new JsonGraphStore(tmp, REPO, fixedClock);
    populate(store, [mkDecision()]);
    const ctx = new ContextBuilder(store, 25).build("Why is Dropdown selection controlled only?");
    expect(ctx.text).toContain("controlled-only selection API");
    expect(ctx.text).toContain("https://github.com/o/r/pull/42");
    expect(ctx.text).toContain("SSR hydration mismatches");
    expect(ctx.text).toContain("Rejected: dual mode");
    expect(ctx.text).toContain("no follow-up evidence found");
    expect(ctx.seedIds.length).toBeGreaterThan(0);
    expect(ctx.includedNodeIds.length).toBeLessThanOrEqual(25);
  });

  it("says so when the graph has no answer", () => {
    const store = new JsonGraphStore(tmp, REPO, fixedClock);
    populate(store, [mkDecision()]);
    const ctx = new ContextBuilder(store).build("zebra quantum blockchain synergy");
    expect(ctx.text).toContain("No decisions in the graph match");
  });

  it("is deterministic for a fixed graph", () => {
    const store = new JsonGraphStore(tmp, REPO, fixedClock);
    populate(store, [mkDecision()]);
    const b = new ContextBuilder(store);
    expect(b.build("dropdown controlled").text).toBe(b.build("dropdown controlled").text);
  });
});

describe("Exports", () => {
  it("GraphML contains typed nodes and edges; Mermaid renders a flowchart", () => {
    const store = new JsonGraphStore(tmp, REPO, fixedClock);
    populate(store, [mkDecision()]);
    const gml = toGraphML(store);
    expect(gml).toContain(`<data key="type">decision</data>`);
    expect(gml).toContain(`<data key="etype">SUPPORTED_BY</data>`);
    const mmd = toMermaid(store);
    expect(mmd).toContain("flowchart LR");
    expect(mmd).toContain("-->|AFFECTS|");
  });
});
