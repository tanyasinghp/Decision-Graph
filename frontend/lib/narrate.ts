import type { RunEvent } from "./types";

/**
 * narrate.ts — turns replay events into narrative language.
 *
 * PRESENTATION ONLY: the replay JSONL and event schema are untouched; this
 * is a pure formatter consumed by the timeline. The audience should read a
 * story ("Following decision evolution…"), never logs ("traverse").
 *
 * Voice rules:
 *  - present progressive for actions ("Searching…", "Reading…")
 *  - past declarative for results ("Recovered architectural decision.")
 *  - concrete objects when the event input names them (PR #1423, Dropdown)
 *  - never expose raw tool names, node ids, or JSON
 */

function shortDecision(id: string | undefined): string | null {
  if (!id) return null;
  const tail = id.split(":").pop() ?? id;
  const words = tail.replace(/-/g, " ").trim();
  return words.length > 2 ? `“${words}”` : null;
}

function artifactRef(text: string): string | null {
  const pr = text.match(/(?:pull\/|PR\s*#?)(\d+)/i);
  if (pr?.[1]) return `PR #${pr[1]}`;
  const issue = text.match(/issues?\/(\d+)|issue\s*#?(\d+)/i);
  const n = issue?.[1] ?? issue?.[2];
  if (n) return `issue #${n}`;
  const rfc = text.match(/rfcs?\/([\w-]+)/i);
  if (rfc?.[1]) return `RFC ${rfc[1].replace(/-/g, " ")}`;
  return null;
}

export function narrateEvent(event: RunEvent): string {
  switch (event.t) {
    case "run_started":
      return "Reasoning engine connected to the decision graph.";

    case "phase":
      switch (event.name) {
        case "planning":
          return "Planning traversal…";
        case "traversal":
          return "Walking the decision graph…";
        case "reasoning":
          return "Reasoning over collected decisions…";
        case "synthesis":
          return "Building reasoning context…";
        default:
          return `${event.name.charAt(0).toUpperCase()}${event.name.slice(1)}…`;
      }

    case "tool_call": {
      const input = (event.input ?? {}) as Record<string, unknown>;
      switch (event.name) {
        case "search_decisions": {
          const q = input.query as string | undefined;
          return q
            ? `Searching the repository for “${q}” decisions…`
            : "Searching recorded decisions…";
        }
        case "traverse": {
          const edgeTypes = (input.edgeTypes as string[]) ?? [];
          const target = shortDecision(input.decisionId as string | undefined);
          if (edgeTypes.includes("SUPERSEDES"))
            return target
              ? `Following how ${target} evolved over time…`
              : "Following decision evolution through time…";
          if (edgeTypes.includes("REJECTED_ALTERNATIVE"))
            return "Examining the roads not taken…";
          if (edgeTypes.includes("OWNED_BY"))
            return "Tracing who drove this decision…";
          return target
            ? `Exploring the reasoning around ${target}…`
            : "Following connected reasoning…";
        }
        case "get_evidence": {
          const target = shortDecision(input.decisionId as string | undefined);
          return target
            ? `Reading the evidence behind ${target}…`
            : "Reading supporting evidence…";
        }
        case "record_answer":
          return "Synthesizing the final answer…";
        default:
          return "Consulting the decision graph…";
      }
    }

    case "tool_result": {
      if (event.isError) return "Dead end — adjusting course.";
      const ref = artifactRef(event.summary);
      if (ref) return `Found supporting context in ${ref}.`;
      // Humanize count-ish summaries without exposing raw ids.
      const count = event.summary.match(/^(\d+)\s/);
      if (count?.[1]) return `Found ${count[1]} related decision${count[1] === "1" ? "" : "s"}.`;
      return "Evidence collected.";
    }

    case "decision_emitted":
      return `Recovered architectural decision — ${event.title}`;

    case "decision_rejected":
      return "Draft decision rejected — insufficient evidence. Re-examining.";

    case "guard_hit":
      return "Ground-truth boundary enforced — path blocked.";

    case "assistant_text":
      return event.text;

    case "run_finished":
      return event.status === "completed"
        ? "Reasoning complete."
        : "Reasoning stopped.";

    default:
      return "";
  }
}
