"use client";

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  type ReactNode,
} from "react";
import type {
  GraphNode,
  RunEvent,
  AnsweredQuestion,
  RepoStats,
  DemoExample,
  EvidenceItem,
  EvidenceCardData,
  CounterfactualResult,
} from "./types";
import { GraphStore } from "./graph-store";

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

export type DemoMode =
  | "idle"
  | "loading"
  | "ready"
  | "querying"
  | "streaming"
  | "answering"
  | "complete"
  | "counterfactual";

export type AnswerPhase =
  | "hidden"
  | "streaming"
  | "decisions"
  | "evidence"
  | "missing"
  | "complete";

export interface DemoState {
  mode: DemoMode;
  repo: RepoStats | null;
  graph: GraphStore | null;
  examples: DemoExample[];
  currentQuestion: string;
  timeline: RunEvent[];
  answer: AnsweredQuestion | null;
  highlightedNodeIds: string[];
  highlightedEdgeIds: string[];
  cameraTarget: { nodeId: string; zoom?: number } | null;
  answerPhase: AnswerPhase;
  currentConfidence: number;
  error: string | null;
  evidenceItems: EvidenceCardData[];
  evidenceDrawerOpen: boolean;
  highlightedEvidenceId: string | null;
  counterfactualResult: CounterfactualResult | null;
  hypotheticalNodeIds: string[];
  predictedNodeIds: string[];
  selectedNodeId: string | null;
  selectedEvidence: EvidenceItem | null;
}

type DemoAction =
  | { type: "SET_LOADING" }
  | { type: "SET_READY"; repo: RepoStats; graph: GraphStore; examples: DemoExample[] }
  | { type: "START_QUERY"; question: string }
  | { type: "START_STREAMING" }
  | { type: "APPEND_EVENT"; event: RunEvent }
  | { type: "SET_ANSWER"; answer: AnsweredQuestion }
  | { type: "SET_ANSWER_PHASE"; phase: AnswerPhase }
  | { type: "SET_CONFIDENCE"; value: number }
  | { type: "SET_CAMERA_TARGET"; target: { nodeId: string; zoom?: number } | null }
  | { type: "SET_COMPLETE" }
  | { type: "HIGHLIGHT_NODES"; ids: string[] }
  | { type: "HIGHLIGHT_EDGES"; ids: string[] }
  | { type: "ADD_EVIDENCE_ITEMS"; items: EvidenceCardData[] }
  | { type: "SET_EVIDENCE_DRAWER"; open: boolean }
  | { type: "HIGHLIGHT_EVIDENCE"; id: string | null }
  | { type: "SET_COUNTERFACTUAL"; result: CounterfactualResult }
  | { type: "SET_HYPOTHETICAL_NODES"; ids: string[] }
  | { type: "SET_PREDICTED_NODES"; ids: string[] }
  | { type: "SELECT_NODE"; id: string | null }
  | { type: "SELECT_EVIDENCE"; evidence: EvidenceItem | null }
  | { type: "SET_ERROR"; message: string }
  | { type: "RESET" };

const initialState: DemoState = {
  mode: "idle",
  repo: null,
  graph: null,
  examples: [],
  currentQuestion: "",
  timeline: [],
  answer: null,
  highlightedNodeIds: [],
  highlightedEdgeIds: [],
  cameraTarget: null,
  answerPhase: "hidden",
  currentConfidence: 0,
  evidenceItems: [],
  evidenceDrawerOpen: false,
  highlightedEvidenceId: null,
  counterfactualResult: null,
  hypotheticalNodeIds: [],
  predictedNodeIds: [],
  selectedNodeId: null,
  selectedEvidence: null,
  error: null,
};

function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, mode: "loading" };

    case "SET_READY":
      return {
        ...state,
        mode: "ready",
        repo: action.repo,
        graph: action.graph,
        examples: action.examples,
      };

    case "START_QUERY":
      return {
        ...state,
        mode: "querying",
        currentQuestion: action.question,
        timeline: [],
        answer: null,
        highlightedNodeIds: [],
        highlightedEdgeIds: [],
        cameraTarget: null,
        answerPhase: "hidden",
        currentConfidence: 0,
        evidenceItems: [],
        evidenceDrawerOpen: false,
        highlightedEvidenceId: null,
        counterfactualResult: null,
        hypotheticalNodeIds: [],
        predictedNodeIds: [],
        selectedNodeId: null,
        selectedEvidence: null,
      };

    case "START_STREAMING":
      return { ...state, mode: "streaming" };

    case "APPEND_EVENT":
      return {
        ...state,
        timeline: [...state.timeline, action.event],
        mode: state.mode === "querying" ? "streaming" : state.mode,
      };

    case "SET_ANSWER":
      return { ...state, answer: action.answer, mode: "answering" };

    case "SET_ANSWER_PHASE":
      return { ...state, answerPhase: action.phase };

    case "SET_CONFIDENCE":
      return { ...state, currentConfidence: action.value };

    case "SET_CAMERA_TARGET":
      return { ...state, cameraTarget: action.target };

    case "SET_COMPLETE":
      return { ...state, mode: "complete" };

    case "HIGHLIGHT_NODES":
      return { ...state, highlightedNodeIds: action.ids };

    case "HIGHLIGHT_EDGES":
      return { ...state, highlightedEdgeIds: action.ids };

    case "ADD_EVIDENCE_ITEMS": {
      const existing = new Map(state.evidenceItems.map((e) => [e.id, e]));
      for (const item of action.items) {
        existing.set(item.id, item);
      }
      return {
        ...state,
        evidenceItems: [...existing.values()],
        evidenceDrawerOpen: state.evidenceDrawerOpen || action.items.length > 0,
      };
    }

    case "SET_EVIDENCE_DRAWER":
      return { ...state, evidenceDrawerOpen: action.open };

    case "HIGHLIGHT_EVIDENCE":
      return { ...state, highlightedEvidenceId: action.id };

    case "SET_COUNTERFACTUAL":
      return {
        ...state,
        mode: "counterfactual",
        counterfactualResult: action.result,
        hypotheticalNodeIds: action.result.hypotheticalNodeIds,
        predictedNodeIds: action.result.predictedNodeIds,
        highlightedNodeIds: [
          ...action.result.hypotheticalNodeIds,
          ...action.result.predictedNodeIds,
        ],
      };

    case "SET_ERROR":
      return { ...state, error: action.message, mode: "idle" };

    case "SET_HYPOTHETICAL_NODES":
      return { ...state, hypotheticalNodeIds: action.ids };

    case "SET_PREDICTED_NODES":
      return { ...state, predictedNodeIds: action.ids };

    case "SELECT_NODE":
      return { ...state, selectedNodeId: action.id };

    case "SELECT_EVIDENCE":
      return { ...state, selectedEvidence: action.evidence };

    case "RESET":
      return initialState;

    default:
      return state;
  }
}

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

interface DemoContextValue {
  state: DemoState;
  dispatch: React.Dispatch<DemoAction>;
  selectNode: (id: string | null) => void;
  selectEvidence: (evidence: EvidenceItem | null) => void;
  startQuery: (question: string) => void;
  appendEvent: (event: RunEvent) => void;
  reset: () => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(demoReducer, initialState);

  const selectNode = useCallback(
    (id: string | null) => dispatch({ type: "SELECT_NODE", id }),
    [],
  );

  const selectEvidence = useCallback(
    (evidence: EvidenceItem | null) =>
      dispatch({ type: "SELECT_EVIDENCE", evidence }),
    [],
  );

  const startQuery = useCallback(
    (question: string) => dispatch({ type: "START_QUERY", question }),
    [],
  );

  const appendEvent = useCallback(
    (event: RunEvent) => dispatch({ type: "APPEND_EVENT", event }),
    [],
  );

  const reset = useCallback(() => dispatch({ type: "RESET" }), []);

  return (
    <DemoContext.Provider
      value={{
        state,
        dispatch,
        selectNode,
        selectEvidence,
        startQuery,
        appendEvent,
        reset,
      }}
    >
      {children}
    </DemoContext.Provider>
  );
}

export function useDemoContext(): DemoContextValue {
  const ctx = useContext(DemoContext);
  if (!ctx) {
    throw new Error("useDemoContext must be used within a DemoProvider");
  }
  return ctx;
}
