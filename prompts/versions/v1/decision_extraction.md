Reconstruct the product/engineering decisions behind the component "{{component}}" in {{repo}}.

Investigate the evidence trail, then emit each distinct decision you can support with evidence (emit_decision, one call per decision). Expect roughly 2–5 real decisions for a mature component — quality over quantity. A single feature usually contains: an initial API-shape decision, sometimes a later reversal or refinement, and occasionally a rejected direction that shaped the outcome.

For each decision, reconstruct:
- context: what problem or trigger prompted it
- hypothesis: what the team believed the chosen path would achieve
- alternatives: what else was on the table and why each was rejected
- chosenSolution, tradeOffs
- evidence: the artifacts (with verbatim excerpts) that support all of the above
- expected vs observed outcome (observed = null unless follow-up evidence exists)
- actors, approximate decidedAt, and a justified confidence grade

Statuses: if a later decision replaced this one, mark it "superseded"; if it was reopened/re-debated, "revisited"; otherwise "adopted". (Cross-decision links are added in a separate pass — your job is accurate per-decision status.)

Begin your investigation now. State your plan in one short paragraph, then start searching.
