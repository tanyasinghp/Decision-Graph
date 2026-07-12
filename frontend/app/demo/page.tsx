"use client";

import { useEffect, useState, useCallback } from "react";
import { Activity } from "lucide-react";
import { useDemoContext } from "@/lib/demo-context";
import { loadGraphFromUrl } from "@/lib/graph-store";
import { loadDemoExamples } from "@/lib/demo-replay";
import { computeCounterfactual } from "@/lib/counterfactual-engine";
import { sleep, formatCount, cn } from "@/lib/utils";
import type { DemoExample } from "@/lib/types";

import { AppHeader } from "@/components/layout/AppHeader";
import { ThreeColumnLayout } from "@/components/layout/ThreeColumnLayout";
import { RepoStatsGrid } from "@/components/repo/RepoStatsGrid";
import { DemoControls } from "@/components/demo/DemoControls";
import { GraphCanvas } from "@/components/graph/GraphCanvas";
import { ReasoningTimeline } from "@/components/reasoning/ReasoningTimeline";
import { AnswerPanel } from "@/components/query/AnswerPanel";
import { CounterfactualPanel } from "@/components/query/CounterfactualPanel";
import { EvidenceDrawer } from "@/components/evidence/EvidenceDrawer";
import { useReasoningStream } from "@/hooks/useReasoningStream";

export default function DemoPage() {
  const { state, dispatch } = useDemoContext();
  const { repo, examples, mode, graph } = state;
  const [error, setError] = useState<string | null>(null);
  const [selectedExample, setSelectedExample] = useState<DemoExample | null>(
    null,
  );
  const [isCounterfactualLoading, setIsCounterfactualLoading] = useState(false);

  const {
    isPlaying,
    speed,
    setSpeed,
    progress,
    totalEvents,
    startReplay,
    stopReplay,
    resetReplay,
  } = useReasoningStream();

  // Load demo data on mount
  useEffect(() => {
    async function init() {
      try {
        dispatch({ type: "SET_LOADING" });

        const [graphData, loadedExamples] = await Promise.all([
          loadGraphFromUrl("/demo/graph.json"),
          loadDemoExamples(),
        ]);

        const computed = graphData.stats;
        const decisions = graphData.decisionNodes();
        const issues = graphData.nodes({ type: "issue" });
        const prs = graphData.nodes({ type: "pull_request" });
        const commits = graphData.nodes({ type: "commit" });

        const repoStats = {
          repo: graphData.repo,
          branch: "main",
          commitCount: commits.length,
          issueCount: issues.length,
          prCount: prs.length,
          decisionCount: computed.decisionCount,
          evidenceCount: computed.evidenceCount,
          nodeCount: computed.nodeCount,
          edgeCount: computed.edgeCount,
          extractionConfidence: 0.86,
        };

        dispatch({
          type: "SET_READY",
          repo: repoStats,
          graph: graphData,
          examples: loadedExamples,
        });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load demo data",
        );
      }
    }

    if (state.mode === "idle") init();
  }, [state.mode, dispatch]);

  // Handle example selection
  const handleSelectExample = useCallback(
    async (example: DemoExample) => {
      setSelectedExample(example);
      dispatch({ type: "START_QUERY", question: example.question });

      try {
        if (example.intent === "counterfactual") {
          if (!graph) return;
          setIsCounterfactualLoading(true);
          await sleep(600);
          const result = computeCounterfactual(example.id, graph);
          dispatch({ type: "SET_COUNTERFACTUAL", result });
          setIsCounterfactualLoading(false);
        } else {
          await startReplay(example.runFile);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to run query");
        setIsCounterfactualLoading(false);
      }
    },
    [dispatch, startReplay, graph, setError],
  );

  // Handle play/replay
  const handlePlay = useCallback(() => {
    if (selectedExample) {
      if (selectedExample.intent === "counterfactual") {
        handleSelectExample(selectedExample);
      } else {
        dispatch({
          type: "START_QUERY",
          question: selectedExample.question,
        });
        startReplay(selectedExample.runFile);
      }
    }
  }, [selectedExample, dispatch, startReplay, handleSelectExample]);

  // Handle stop
  const handleStop = useCallback(() => {
    stopReplay();
  }, [stopReplay]);

  // Handle reset
  const handleReset = useCallback(() => {
    resetReplay();
    setSelectedExample(null);
  }, [resetReplay]);

  // Loading state
  if (mode === "loading") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0b]">
        <div className="flex flex-col items-center gap-4">
          <Activity className="w-6 h-6 text-accent" />
          <p className="text-small text-text-tertiary">Loading graph...</p>
        </div>
      </main>
    );
  }

  // Error state
  if (error) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0b]">
        <div className="text-center max-w-sm">
          <p className="text-body text-error mb-2">Failed to load</p>
          <p className="text-small text-text-tertiary mb-4">{error}</p>
          <button
            onClick={() => {
              setError(null);
              dispatch({ type: "RESET" });
            }}
            className="text-small text-accent hover:text-accent-hover transition-colors"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  const hasQuery = mode !== "idle" && mode !== "ready";
  const isCounterfactual = mode === "counterfactual";

  return (
    <main className="min-h-screen bg-[#0a0a0b] flex flex-col">
      <AppHeader />

      <div className="flex-1 flex flex-col">
        {/* Controls bar */}
        <div className="px-page py-3 border-b border-border">
          <div className="max-w-[1600px] mx-auto space-y-3">
            {/* Stats */}
            {repo && !hasQuery && (
              <RepoStatsGrid
                commitCount={formatCount(312)}
                issueCount={formatCount(89)}
                prCount={formatCount(156)}
                decisionCount={String(repo.decisionCount)}
                confidence="86%"
              />
            )}

            {/* Demo controls */}
            <DemoControls
              examples={examples}
              selectedExample={selectedExample}
              onSelectExample={handleSelectExample}
              isPlaying={isPlaying || isCounterfactualLoading}
              speed={speed}
              onSpeedChange={setSpeed}
              onPlay={handlePlay}
              onStop={handleStop}
              onReset={handleReset}
              progress={progress}
              totalEvents={totalEvents}
              disabled={!selectedExample}
            />
          </div>
        </div>

        {/* Main content */}
        <div
          className={cn(
            "flex-1",
            !hasQuery && "flex items-center justify-center",
          )}
        >
          {hasQuery ? (
            <div className="relative h-full w-full">
              <ThreeColumnLayout
                left={<GraphCanvas isEmpty={false} />}
                center={
                  isCounterfactual ? (
                    <CounterfactualPanel />
                  ) : (
                    <ReasoningTimeline />
                  )
                }
                right={
                  isCounterfactual ? (
                    <div className="h-full flex items-center justify-center text-center px-6">
                      <div>
                        <p className="text-small text-text-tertiary mb-1">
                          Counterfactual Mode
                        </p>
                        <p className="text-caption text-text-tertiary/60">
                          The right panel shows a structured analysis. Use the
                          center panel to explore the counterfactual result.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <AnswerPanel />
                  )
                }
                visible
              />
              <EvidenceDrawer />
            </div>
          ) : (
            <div className="text-center px-6">
              <p className="text-body text-text-tertiary mb-2">
                Select a question above to see how Decision Graph reconstructs
                product reasoning from engineering evidence.
              </p>
              <p className="text-small text-text-tertiary/60">
                Or select a counterfactual scenario to explore
                hypothetical "what if" analysis.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
