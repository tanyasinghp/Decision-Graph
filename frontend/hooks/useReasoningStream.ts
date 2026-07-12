"use client";

import { useCallback, useRef, useState } from "react";
import { useDemoContext } from "@/lib/demo-context";
import { loadRunLog } from "@/lib/demo-replay";
import { buildScenes } from "@/lib/replay-orchestrator";
import { extractEvidenceFromEvent } from "@/lib/evidence-extractor";
import { sleep } from "@/lib/utils";
import type { Answer, RunEvent } from "@/lib/types";

export interface ReasoningStreamState {
  isPlaying: boolean;
  speed: number;
  progress: number;
  totalEvents: number;
}

export function useReasoningStream() {
  const { state, dispatch } = useDemoContext();
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const [progress, setProgress] = useState(0);
  const [totalEvents, setTotalEvents] = useState(0);
  const abortRef = useRef(false);
  const speedRef = useRef(1);
  const knownEvidenceUrls = useRef(new Set<string>());
  const sceneIndexRef = useRef(0);

  const setSpeed = useCallback((s: number) => {
    speedRef.current = s;
    setSpeedState(s);
  }, []);

  const startReplay = useCallback(
    async (runFile: string) => {
      if (isPlaying) return;

      abortRef.current = false;
      knownEvidenceUrls.current.clear();
      sceneIndexRef.current = 0;
      setIsPlaying(true);
      dispatch({ type: "START_STREAMING" });

      try {
        const events = await loadRunLog(runFile);

        // Convert events to timed scenes via the orchestrator
        const scenes = buildScenes(events, state.graph);

        // Compute total "progress units" — events + answer sub-scenes
        const sceneEventsOnly = scenes.filter((s) => s.timelineEvent !== null);
        setTotalEvents(sceneEventsOnly.length);
        setProgress(0);

        let eventCount = 0;
        let answerExtracted = false;

        for (let i = 0; i < scenes.length; i++) {
          if (abortRef.current) break;

          const scene = scenes[i]!;
          sceneIndexRef.current = i;

          // Honor waitBefore (hero pauses, answer reveal pauses)
          if (scene.waitBefore > 0) {
            await sleep(scene.waitBefore / speedRef.current);
          }

          // Apply confidence
          if (scene.confidence > 0) {
            dispatch({ type: "SET_CONFIDENCE", value: scene.confidence });
          }

          // Apply camera target
          if (scene.cameraTarget) {
            dispatch({
              type: "SET_CAMERA_TARGET",
              target: scene.cameraTarget,
            });
          }

          // Apply highlights
          if (scene.highlightedNodeIds.length > 0) {
            dispatch({
              type: "HIGHLIGHT_NODES",
              ids: scene.highlightedNodeIds,
            });
          }
          if (scene.highlightedEdgeIds.length > 0) {
            dispatch({
              type: "HIGHLIGHT_EDGES",
              ids: scene.highlightedEdgeIds,
            });
          }

          // Apply answer phase (for answer reveal sub-scenes)
          if (scene.answerPhase !== "hidden") {
            dispatch({ type: "SET_ANSWER_PHASE", phase: scene.answerPhase });
          }

          // Extract and dispatch evidence items from this scene's event
          if (scene.timelineEvent) {
            const newCards = extractEvidenceFromEvent(
              scene.timelineEvent,
              state.graph,
              knownEvidenceUrls.current,
              eventCount,
            );
            if (newCards.length > 0) {
              dispatch({ type: "ADD_EVIDENCE_ITEMS", items: newCards });
            }
          }

          // Dispatch timeline event if present
          if (scene.timelineEvent) {
            const event = scene.timelineEvent;
            dispatch({ type: "APPEND_EVENT", event });
            eventCount++;
            setProgress(eventCount);

            // Extract answer from record_answer
            if (
              event.t === "tool_call" &&
              event.name === "record_answer" &&
              !answerExtracted
            ) {
              const input = event.input as Record<string, unknown>;
              const answerData: Answer = {
                answer: (input.answer as string) ?? "",
                certainty:
                  (input.certainty as Answer["certainty"]) ?? "unknown",
                supportingDecisionIds:
                  (input.supportingDecisionIds as string[]) ?? [],
                supportingEvidenceUrls:
                  (input.supportingEvidenceUrls as string[]) ?? [],
                missingEvidence: (input.missingEvidence as string) ?? null,
                reasoningSummary: (input.reasoningSummary as string) ?? "",
              };
              dispatch({
                type: "SET_ANSWER",
                answer: {
                  answer: answerData,
                  trace: {
                    question: "",
                    intent: "",
                    matchedRule: "",
                    seedIds: [],
                    visitedNodeIds: [],
                    contextTokens: 0,
                    proposedCertainty: "unknown",
                    certaintyCeiling: "unknown",
                    certaintyDowngraded: false,
                    rejectedCitations: [],
                  },
                  plan: { intent: "", matchedRule: "", emphasis: "" },
                },
              });
              answerExtracted = true;
            }

            // Scene timing
            if (!scene.isHeroPause) {
              const baseDelay = getSceneDelay(scene.type);
              await sleep(baseDelay / speedRef.current);
            }
          }
        }

        if (!abortRef.current) {
          dispatch({ type: "SET_CAMERA_TARGET", target: null });
          dispatch({ type: "SET_COMPLETE" });
          await sleep(800 / speedRef.current);
          dispatch({ type: "SET_ANSWER_PHASE", phase: "complete" });
        }
      } catch (err) {
        console.error("Replay failed:", err);
        dispatch({
          type: "SET_ERROR",
          message: err instanceof Error ? err.message : "Replay failed",
        });
      } finally {
        setIsPlaying(false);
      }
    },
    [dispatch, isPlaying, state.graph],
  );

  const stopReplay = useCallback(() => {
    abortRef.current = true;
    setIsPlaying(false);
  }, []);

  const resetReplay = useCallback(() => {
    stopReplay();
    knownEvidenceUrls.current.clear();
    dispatch({ type: "START_QUERY", question: state.currentQuestion });
  }, [stopReplay, dispatch, state.currentQuestion]);

  return {
    isPlaying,
    speed,
    setSpeed,
    progress,
    totalEvents,
    startReplay,
    stopReplay,
    resetReplay,
  };
}

function getSceneDelay(type: string): number {
  switch (type) {
    case "hero-pause":
      return 1200;
    case "system-ready":
      return 200;
    case "planning":
      return 600;
    case "traversal":
      return 700;
    case "search":
      return 500;
    case "evidence":
      return 800;
    case "decision-found":
      return 600;
    case "reasoning":
      return 900;
    case "synthesis":
      return 700;
    case "answer-streaming":
      return 100;
    case "answer-decisions":
      return 100;
    case "answer-evidence":
      return 100;
    case "answer-missing":
      return 100;
    case "answer-complete":
      return 100;
    case "complete":
      return 400;
    default:
      return 400;
  }
}

export function getEventDescription(event: RunEvent): string {
  switch (event.t) {
    case "phase":
      return event.name.charAt(0).toUpperCase() + event.name.slice(1);
    case "tool_call":
      return event.name.replace(/_/g, " ");
    case "tool_result":
      return event.summary;
    case "decision_emitted":
      return `Decision: ${event.title}`;
    case "decision_rejected":
      return `Rejected: ${event.errors.join(", ")}`;
    case "guard_hit":
      return `Guard blocked: ${event.path}`;
    case "assistant_text":
      return event.text;
    case "run_started":
      return "Run started";
    case "run_finished":
      return event.status === "completed" ? "Complete" : `Failed: ${event.status}`;
    default:
      return "";
  }
}

export function getEventIcon(event: RunEvent): string {
  switch (event.t) {
    case "phase":
      return "phase";
    case "tool_call":
      if (event.name === "search_decisions") return "search";
      if (event.name === "traverse") return "traverse";
      if (event.name === "get_evidence") return "evidence";
      if (event.name === "record_answer") return "answer";
      return "tool";
    case "tool_result":
      return "result";
    case "decision_emitted":
      return "decision";
    case "decision_rejected":
      return "rejected";
    case "assistant_text":
      return "text";
    case "guard_hit":
      return "guard";
    case "run_started":
      return "start";
    case "run_finished":
      return event.status === "completed" ? "complete" : "failed";
    default:
      return "event";
  }
}
