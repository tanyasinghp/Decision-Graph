import type { RunEvent, GraphNode } from "./types";
import type { GraphStore } from "./graph-store";
import { computeHighlights } from "./compute-highlights";

/* ------------------------------------------------------------------ */
/* Scene types — the single source of truth for every visual change   */
/* ------------------------------------------------------------------ */

export type SceneType =
  | "hero-pause"
  | "planning"
  | "traversal"
  | "search"
  | "evidence"
  | "decision-found"
  | "reasoning"
  | "synthesis"
  | "answer-streaming"
  | "answer-decisions"
  | "answer-evidence"
  | "answer-missing"
  | "answer-complete"
  | "complete"
  | "system-ready";

export interface Scene {
  type: SceneType;
  timelineEvent: RunEvent | null;
  highlightedNodeIds: string[];
  highlightedEdgeIds: string[];
  cameraTarget: { nodeId: string; zoom?: number } | null;
  confidence: number;
  answerPhase: "hidden" | "streaming" | "decisions" | "evidence" | "missing" | "complete";
  waitBefore: number;
  isHeroPause: boolean;
}

/* ------------------------------------------------------------------ */
/* Scene builder — pure function, no side effects                      */
/* ------------------------------------------------------------------ */

const CERTAINTY_VALUES: Record<string, number> = {
  known: 0.95,
  likely: 0.75,
  possible: 0.50,
  unknown: 0.30,
};

export function buildScenes(
  events: RunEvent[],
  graph: GraphStore | null,
): Scene[] {
  if (!Array.isArray(events) || events.length === 0) {
    return [];
  }
  const scenes: Scene[] = [];

  // ----- Hero pause (1.2s silent anticipation) ----- //
  scenes.push({
    type: "hero-pause",
    timelineEvent: null,
    highlightedNodeIds: [],
    highlightedEdgeIds: [],
    cameraTarget: null,
    confidence: 0.30,
    answerPhase: "hidden",
    waitBefore: 0,
    isHeroPause: true,
  });

  // Determine final confidence from the run's record_answer event
  let finalCertainty: string = "unknown";
  let targetConfidence = 0.30;
  for (const e of events) {
    if (e.t === "tool_call" && e.name === "record_answer") {
      const input = (e.input ?? {}) as Record<string, unknown>;
      finalCertainty = (input.certainty as string) ?? "unknown";
      targetConfidence = CERTAINTY_VALUES[finalCertainty] ?? 0.75;
    }
  }

  const totalEvents = events.length;

  for (let i = 0; i < totalEvents; i++) {
    const event = events[i]!;

    // Skip record_answer tool_result — handled inline
    if (
      event.t === "tool_result" &&
      events[i - 1]?.t === "tool_call" &&
      (events[i - 1] as { name?: string }).name === "record_answer"
    ) {
      continue;
    }

    // Compute highlights from the event
    const highlights = computeHighlights(event, graph);

    // Compute camera target from event
    const cameraTarget = computeCameraTarget(event, graph);

    // Compute confidence based on event progress
    const progress = (i + 1) / totalEvents;
    const confidence = interpolate(0.30, targetConfidence, easeOutCubic(progress));

    // Determine scene type from event
    const sceneType = classifyScene(event, i, totalEvents);

    scenes.push({
      type: sceneType,
      timelineEvent: event,
      highlightedNodeIds: highlights.nodeIds,
      highlightedEdgeIds: highlights.edgeIds,
      cameraTarget,
      confidence: Math.round(confidence * 100) / 100,
      answerPhase: "hidden",
      waitBefore: 0,
      isHeroPause: false,
    });

    // If this is record_answer, insert answer reveal sub-scenes after a pause
    if (event.t === "tool_call" && event.name === "record_answer") {
      const input = (event.input ?? {}) as Record<string, unknown> | undefined;
      const hasMissing = !!input?.missingEvidence;

      scenes.push({
        type: "answer-streaming",
        timelineEvent: null,
        highlightedNodeIds: highlights.nodeIds,
        highlightedEdgeIds: highlights.edgeIds,
        cameraTarget: null,
        confidence: targetConfidence,
        answerPhase: "streaming",
        waitBefore: 600,
        isHeroPause: false,
      });

      scenes.push({
        type: "answer-decisions",
        timelineEvent: null,
        highlightedNodeIds: highlights.nodeIds,
        highlightedEdgeIds: highlights.edgeIds,
        cameraTarget: null,
        confidence: targetConfidence,
        answerPhase: "decisions",
        waitBefore: 800,
        isHeroPause: false,
      });

      scenes.push({
        type: "answer-evidence",
        timelineEvent: null,
        highlightedNodeIds: highlights.nodeIds,
        highlightedEdgeIds: highlights.edgeIds,
        cameraTarget: null,
        confidence: targetConfidence,
        answerPhase: "evidence",
        waitBefore: 600,
        isHeroPause: false,
      });

      if (hasMissing) {
        scenes.push({
          type: "answer-missing",
          timelineEvent: null,
          highlightedNodeIds: highlights.nodeIds,
          highlightedEdgeIds: highlights.edgeIds,
          cameraTarget: null,
          confidence: targetConfidence,
          answerPhase: "missing",
          waitBefore: 600,
          isHeroPause: false,
        });
      }

      scenes.push({
        type: "answer-complete",
        timelineEvent: null,
        highlightedNodeIds: highlights.nodeIds,
        highlightedEdgeIds: highlights.edgeIds,
        cameraTarget: null,
        confidence: targetConfidence,
        answerPhase: "complete",
        waitBefore: 400,
        isHeroPause: false,
      });
    }
  }

  // Final complete scene — zoom back out
  scenes.push({
    type: "complete",
    timelineEvent: null,
    highlightedNodeIds: [],
    highlightedEdgeIds: [],
    cameraTarget: null,
    confidence: targetConfidence,
    answerPhase: "complete",
    waitBefore: 300,
    isHeroPause: false,
  });

  return scenes;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function classifyScene(
  event: RunEvent,
  index: number,
  total: number,
): SceneType {
  switch (event.t) {
    case "phase":
      switch (event.name) {
        case "planning":
          return "planning";
        case "traversal":
          return "traversal";
        case "reasoning":
          return "reasoning";
        case "synthesis":
          return "synthesis";
        default:
          return "planning";
      }
    case "tool_call":
      switch (event.name) {
        case "search_decisions":
          return "search";
        case "traverse":
          return "traversal";
        case "get_evidence":
          return "evidence";
        case "record_answer":
          return "answer-streaming";
        default:
          return "traversal";
      }
    case "tool_result":
      return index < total * 0.4 ? "search" : "evidence";
    case "decision_emitted":
      return "decision-found";
    case "assistant_text":
      return "reasoning";
    case "run_started":
      return "system-ready";
    case "run_finished":
      return "complete";
    default:
      return "traversal";
  }
}

function computeCameraTarget(
  event: RunEvent,
  graph: GraphStore | null,
): { nodeId: string; zoom?: number } | null {
  if (!graph) return null;

  switch (event.t) {
    case "tool_call": {
      const input = (event.input ?? {}) as Record<string, unknown>;
      const decisionId = input.decisionId as string | undefined;
      if (decisionId && graph.getNode(decisionId)) {
        return { nodeId: decisionId, zoom: 1.5 };
      }
      // For search_decisions with a query, find the first matching decision
      const query = input.query as string | undefined;
      if (event.name === "search_decisions" && query) {
        const match = graph.nodes().find((n) =>
          n.label.toLowerCase().includes(query.toLowerCase()),
        );
        if (match) return { nodeId: match.id, zoom: 1.5 };
      }
      return null;
    }
    case "decision_emitted": {
      const id = event.decisionId;
      if (graph.getNode(id)) return { nodeId: id, zoom: 1.5 };
      return null;
    }
    case "tool_result": {
      // Try to find a node ID mentioned in the summary
      const words = event.summary.split(/\s+/);
      for (const w of words) {
        // Match IDs like PR#1423, Issue#89, or full node ID patterns
        const clean = w.replace(/[#,\\.!?]/g, "");
        const node = graph.nodes().find((n) => n.id.includes(clean) || n.label.includes(clean));
        if (node) return { nodeId: node.id, zoom: 1.3 };
      }
      return null;
    }
    default:
      return null;
  }
}

function interpolate(start: number, end: number, t: number): number {
  return start + (end - start) * Math.max(0, Math.min(1, t));
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
