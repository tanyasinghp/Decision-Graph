/**
 * tests/schemas.test.ts
 *
 * The evidence gate is the system's core safety property, so its acceptance
 * and rejection behavior is pinned by tests before any agent code exists.
 */

import { describe, expect, it } from "vitest";
import { DecisionInputSchema, EvidenceSchema } from "@dg/domain/schemas.js";
import { EDGE_RULES, EdgeTypeSchema } from "@dg/domain/graph.js";

const validEvidence = {
  id: "pr-1234",
  kind: "pr" as const,
  url: "https://github.com/razorpay/blade/pull/1234",
  title: "feat(Dropdown): controlled selection API",
  excerpt:
    "We discussed exposing both controlled and uncontrolled modes, but SSR hydration bugs with uncontrolled state pushed us to controlled-only.",
  date: "2023-04-11",
};

const validDecision = {
  title: "Dropdown exposes a controlled-only selection API",
  scope: { component: "Dropdown" },
  status: "adopted" as const,
  hypothesis:
    "A controlled-only API avoids SSR hydration mismatches and keeps state ownership unambiguous.",
  context:
    "Repeated hydration bugs were reported when uncontrolled dropdown state diverged between server and client renders.",
  alternatives: [
    {
      option: "Support both controlled and uncontrolled modes",
      reasonRejected: "Doubles the API surface and reintroduces hydration bug class",
      evidenceIds: ["pr-1234"],
    },
  ],
  chosenSolution:
    "Expose value/onChange as required props; no internal selection state.",
  tradeOffs: ["Consumers must wire state even for simple cases"],
  evidence: [validEvidence],
  observedOutcome: null,
  confidence: "high" as const,
  confidenceRationale: "Explicit discussion of alternatives and rationale in PR thread",
  actors: ["somedev"],
  decidedAt: "2023-04-11",
};

describe("EvidenceSchema", () => {
  it("accepts a well-formed evidence item", () => {
    expect(EvidenceSchema.safeParse(validEvidence).success).toBe(true);
  });

  it("rejects non-GitHub URLs (citations must be click-verifiable)", () => {
    const r = EvidenceSchema.safeParse({ ...validEvidence, url: "https://example.com/x" });
    expect(r.success).toBe(false);
  });

  it("rejects trivially short excerpts (no '+1' as evidence)", () => {
    const r = EvidenceSchema.safeParse({ ...validEvidence, excerpt: "yes, agreed" });
    expect(r.success).toBe(false);
  });
});

describe("DecisionInputSchema — the evidence gate", () => {
  it("accepts a fully evidenced decision", () => {
    expect(DecisionInputSchema.safeParse(validDecision).success).toBe(true);
  });

  it("rejects a decision with zero evidence", () => {
    const r = DecisionInputSchema.safeParse({ ...validDecision, evidence: [] });
    expect(r.success).toBe(false);
  });

  it("rejects when observedOutcome is omitted (must be explicit null)", () => {
    const { observedOutcome: _omitted, ...rest } = validDecision;
    expect(DecisionInputSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing confidence rationale", () => {
    const r = DecisionInputSchema.safeParse({ ...validDecision, confidenceRationale: "ok" });
    expect(r.success).toBe(false);
  });
});

describe("Graph edge contracts", () => {
  it("every edge type has an endpoint rule", () => {
    for (const t of EdgeTypeSchema.options) {
      expect(EDGE_RULES[t]).toBeDefined();
      expect(EDGE_RULES[t].from.length).toBeGreaterThan(0);
      expect(EDGE_RULES[t].to.length).toBeGreaterThan(0);
    }
  });
});
