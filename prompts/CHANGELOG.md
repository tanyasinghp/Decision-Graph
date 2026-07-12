# Prompt version changelog

Extraction prompts are the experimental variable of the evaluation loop.
Every version is kept forever; every change states its hypothesis so results
are interpretable. Judge/query prompts are unversioned on purpose — the
measuring stick must not move between experiments.

## v1 (baseline)
Initial extraction prompt: archaeologist persona, evidence rules, decision
definition, budget guidance. No prescribed investigation structure.

## v2 (hypothesis-driven revision, pre-registered before first benchmark)
Changes and the failure hypotheses they target:

- H1 (over-emission of trivia): added the 3-part decision-worthiness test
  with explicit negative examples ("Added prop X", version bumps).
  Expected effect: precision ↑, extracted count ↓.
- H2 (alternatives under-mined): review comments explicitly named as an
  alternatives source; "an alternative mentioned only in a review comment is
  still an alternative." Expected: evidence coverage on alternatives ↑.
- H3 (unfocused budget spend): two-phase protocol (survey → shortlist →
  deep read), RFC-first heuristic, mandated multi-phrasing search with domain
  synonyms. Expected: recall ↑ at equal budget.
- H4 (confidence inflation): anchored rubric + "when torn, pick lower".
  Expected: calibration (match-rate by grade) monotonicity ↑.
- H5 (missed supersedes chains): mandatory reversal search ("revert",
  "deprecate", "v2", "breaking") before finalizing status. Expected:
  superseded-status accuracy ↑, +1 decision/component on evolved components.

Verdict per hypothesis is recorded here after each benchmark run.
