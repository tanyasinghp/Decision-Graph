"use client";

import { useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, FileSearch, BarChart3 } from "lucide-react";
import { useDemoContext } from "@/lib/demo-context";
import { EvidenceCard } from "./EvidenceCard";
import type { EvidenceCardData } from "@/lib/types";
import { cn } from "@/lib/utils";

export function EvidenceDrawer() {
  const { state, dispatch } = useDemoContext();
  const {
    evidenceItems,
    evidenceDrawerOpen,
    answer,
    answerPhase,
    currentConfidence,
  } = state;
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to newest evidence
  useEffect(() => {
    if (evidenceDrawerOpen) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [evidenceItems.length, evidenceDrawerOpen]);

  const handleClose = useCallback(() => {
    dispatch({ type: "SET_EVIDENCE_DRAWER", open: false });
  }, [dispatch]);

  // Group evidence by source decision
  const items = evidenceItems ?? [];
  const groups = new Map<string, EvidenceCardData[]>();
  for (const item of items) {
    const existing = groups.get(item.sourceDecisionId) ?? [];
    existing.push(item);
    groups.set(item.sourceDecisionId, existing);
  }

  const showMissing = answer && answerPhase === "complete" && answer.answer.missingEvidence;

  return (
    <>
      {/* Overlay */}
      {evidenceDrawerOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 bg-black/40 z-30"
          onClick={handleClose}
        />
      )}

      {/* Drawer */}
      <motion.aside
        initial={{ x: "100%" }}
        animate={{ x: evidenceDrawerOpen ? 0 : "100%" }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          "fixed top-0 right-0 h-full w-[420px] max-w-[90vw] z-40",
          "bg-[#0a0a0b] border-l border-border",
          "flex flex-col",
        )}
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <FileSearch className="w-4 h-4 text-accent" />
            <h3 className="text-small font-medium text-text-primary">
              Evidence Explorer
            </h3>
            {items.length > 0 && (
              <span className="text-caption px-1.5 py-0.5 rounded bg-accent/10 text-accent tabular-nums">
                {evidenceItems.length}
              </span>
            )}
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-surface-hover transition-colors text-text-tertiary hover:text-text-primary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-6 text-center">
              <FileSearch className="w-8 h-8 text-text-tertiary/40 mb-3" />
              <p className="text-small text-text-tertiary mb-1">
                No evidence collected yet
              </p>
              <p className="text-caption text-text-tertiary/60">
                Evidence will appear here as the system reasons through the graph.
              </p>
            </div>
          ) : (
            <div className="py-3 px-3 space-y-4">
              {/* Evidence cards grouped by decision */}
              {[...groups.entries()].map(([decisionId, cards]) => (
                <div key={decisionId}>
                  <div className="px-1 mb-2">
                    <p className="text-caption font-medium text-text-secondary">
                      {cards[0]?.sourceDecisionLabel ?? decisionId}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {cards.map((card, i) => (
                      <EvidenceCard key={card.id} card={card} index={i} />
                    ))}
                  </div>
                </div>
              ))}

              {/* Confidence section */}
              {currentConfidence > 0 && (
                <div className="px-1 pt-2 border-t border-border/50">
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart3 className="w-3.5 h-3.5 text-accent" />
                    <span className="text-caption font-medium text-text-secondary">
                      Confidence
                    </span>
                  </div>
                  <div className="flex items-center gap-3 px-1">
                    <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-accent"
                        initial={{ width: 0 }}
                        animate={{
                          width: `${currentConfidence * 100}%`,
                        }}
                        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                      />
                    </div>
                    <span className="text-caption font-medium text-accent tabular-nums">
                      {Math.round(currentConfidence * 100)}%
                    </span>
                  </div>
                  <p className="text-caption text-text-tertiary mt-1.5 px-1">
                    {items.length} evidence items collected across{" "}
                    {groups.size} decision{groups.size !== 1 ? "s" : ""}
                  </p>
                </div>
              )}

              {/* Missing evidence */}
              {showMissing && (
                <div className="px-3 py-3 rounded-lg bg-orange-500/5 border border-orange-500/15">
                  <div className="flex items-start gap-2">
                    <span className="text-caption text-orange-400 mt-0.5">!</span>
                    <div>
                      <p className="text-small font-medium text-orange-300 mb-1">
                        Missing Evidence
                      </p>
                      <p className="text-caption text-text-secondary leading-relaxed">
                        {answer!.answer.missingEvidence}
                      </p>
                      <div className="mt-2 pt-2 border-t border-orange-500/10">
                        <p className="text-caption text-text-tertiary">
                          Confidence could improve with:
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          <li className="text-caption text-text-tertiary/80">
                            • Slack message search for team discussions
                          </li>
                          <li className="text-caption text-text-tertiary/80">
                            • Linear integration for issue tracking
                          </li>
                          <li className="text-caption text-text-tertiary/80">
                            • Browser analytics for A/B test data
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </motion.aside>
    </>
  );
}
