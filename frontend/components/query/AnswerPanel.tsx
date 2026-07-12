"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink, Loader2 } from "lucide-react";
import { useDemoContext } from "@/lib/demo-context";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { ExpandableSection } from "./ExpandableSection";
import { AnswerPanelSkeleton } from "@/components/shared/Skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";

export function AnswerPanel() {
  const { state, dispatch } = useDemoContext();
  const { answer, currentQuestion, mode, answerPhase, currentConfidence } = state;

  if (mode === "loading") {
    return <AnswerPanelSkeleton />;
  }

  if (!currentQuestion) {
    return (
      <EmptyState
        icon={
          <svg
            className="w-8 h-8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        }
        title="Answer Panel"
        description="Ask a question to see Claude's reconstruction here."
      />
    );
  }

  const answerData = answer?.answer;
  const decIds = answerData?.supportingDecisionIds ?? [];
  const evUrls = answerData?.supportingEvidenceUrls ?? [];
  const canShowAnswer = answerPhase !== "hidden";
  const canShowDecisions =
    answerPhase === "decisions" ||
    answerPhase === "evidence" ||
    answerPhase === "missing" ||
    answerPhase === "complete";
  const canShowEvidence =
    answerPhase === "evidence" ||
    answerPhase === "missing" ||
    answerPhase === "complete";
  const canShowMissing = answerPhase === "missing" || answerPhase === "complete";
  const isStreaming = answerPhase === "streaming";

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 px-4 py-3 border-b border-border">
        <h3 className="text-small font-medium text-text-primary">Answer</h3>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Question */}
        <div className="px-4 py-4 border-b border-border">
          <p className="text-caption text-text-tertiary mb-1.5">Question</p>
          <p className="text-body text-text-primary font-medium leading-snug">
            {currentQuestion}
          </p>
        </div>

        {/* Answer content */}
        <div className="divide-y divide-border">
          {answer && canShowAnswer ? (
            <>
              {/* Confidence evolution */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="px-4 py-3 flex items-center justify-between"
              >
                <p className="text-caption text-text-tertiary">Confidence</p>
                <div className="flex items-center gap-3">
                  <div className="w-24 h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-accent"
                      initial={{ width: 0 }}
                      animate={{ width: `${currentConfidence * 100}%` }}
                      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </div>
                  <span className="text-caption font-medium text-accent tabular-nums">
                    {Math.round(currentConfidence * 100)}%
                  </span>
                </div>
              </motion.div>

              {/* Final answer */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="px-4 py-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-caption text-text-tertiary">Claude Answer</p>
                  {!isStreaming && answerData && (
                    <ConfidenceBadge level={answerData.certainty} />
                  )}
                </div>
                  {isStreaming ? (
                  <div className="flex items-start gap-2">
                    <p className="text-small text-text-primary leading-relaxed flex-1">
                      {answerData?.answer ?? ""}
                    </p>
                    <Loader2 className="w-3.5 h-3.5 text-accent animate-spin flex-shrink-0 mt-1" />
                  </div>
                ) : (
                  <p className="text-small text-text-primary leading-relaxed">
                    {answerData?.answer ?? ""}
                  </p>
                )}
              </motion.div>

              {/* Reasoning summary */}
              {!isStreaming && (
                <ExpandableSection title="Reasoning Summary" delay={0.1}>
                  <p className="text-small text-text-secondary leading-relaxed">
                    {answerData?.reasoningSummary ?? ""}
                  </p>
                </ExpandableSection>
              )}

              {/* Supporting decisions */}
              <AnimatePresence>
                {canShowDecisions && (
                  <ExpandableSection
                    title="Supporting Decisions"
                    badge={String(decIds.length)}
                    delay={0.15}
                  >
                    <ul className="space-y-2">
                      {decIds.map((id) => (
                        <li key={id}>
                          <button
                            onClick={() =>
                              dispatch({ type: "SELECT_NODE", id })
                            }
                            className="text-small text-accent hover:text-accent-hover transition-colors text-left break-all"
                          >
                            {id.split(":").pop()?.replace(/-/g, " ") ?? id}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </ExpandableSection>
                )}
              </AnimatePresence>

              {/* Supporting evidence */}
              <AnimatePresence>
                {canShowEvidence && (
                  <ExpandableSection
                    title="Supporting Evidence"
                    badge={String(evUrls.length)}
                    delay={0.2}
                  >
                    <ul className="space-y-1.5">
                      {evUrls.map((url) => (
                        <li key={url}>
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-small text-text-secondary hover:text-accent transition-colors"
                          >
                            <ExternalLink className="w-3 h-3 flex-shrink-0" />
                            {url.replace("https://github.com/", "")}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </ExpandableSection>
                )}
              </AnimatePresence>

              {/* Missing evidence */}
              <AnimatePresence>
                {canShowMissing && answerData?.missingEvidence && (
                  <ExpandableSection
                    title="Missing Evidence"
                    defaultOpen
                    delay={0.25}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-caption text-orange-400 mt-0.5">!</span>
                      <div className="flex-1">
                        <p className="text-small text-text-secondary leading-relaxed">
                          {answerData?.missingEvidence}
                        </p>
                        <button
                          onClick={() =>
                            dispatch({ type: "SET_EVIDENCE_DRAWER", open: true })
                          }
                          className="inline-flex items-center gap-1 mt-2 text-caption text-accent hover:text-accent-hover transition-colors"
                        >
                          Open Evidence Explorer
                        </button>
                      </div>
                    </div>
                  </ExpandableSection>
                )}
              </AnimatePresence>

              {/* Streaming indicator */}
              {isStreaming && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="px-4 py-4 text-center"
                >
                  <div className="flex items-center justify-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                    <span className="text-caption text-text-tertiary">
                      Synthesizing answer...
                    </span>
                  </div>
                </motion.div>
              )}
            </>
          ) : (
            /* Pending answer */
            <div className="px-4 py-8 text-center">
              {mode === "streaming" && answerPhase === "hidden" ? (
                <div className="flex flex-col items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                  <p className="text-caption text-text-tertiary">
                    Claude is reasoning...
                  </p>
                  {currentConfidence > 0 && (
                    <div className="flex items-center gap-2 mt-2">
                      <div className="w-20 h-1 rounded-full bg-white/5 overflow-hidden">
                        <motion.div
                          className="h-full rounded-full bg-accent/60"
                          initial={{ width: 0 }}
                          animate={{ width: `${currentConfidence * 100}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                      <span className="text-caption text-text-tertiary tabular-nums">
                        {Math.round(currentConfidence * 100)}%
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-caption text-text-tertiary">
                  Waiting for answer
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
