"use client";

import { motion } from "framer-motion";
import {
  GitPullRequest,
  ArrowRight,
  AlertTriangle,
  BarChart3,
  ExternalLink,
} from "lucide-react";
import { useDemoContext } from "@/lib/demo-context";
import { cn } from "@/lib/utils";
import type { HypotheticalChange, PredictedConsequence } from "@/lib/types";

const CHANGE_ICONS: Record<string, React.ReactNode> = {
  reverted: <ArrowRight className="w-3.5 h-3.5 text-red-400" />,
  switched: <ArrowRight className="w-3.5 h-3.5 text-amber-400" />,
  modified: <ArrowRight className="w-3.5 h-3.5 text-purple-400" />,
  invalidated: <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />,
};

const CONSEQUENCE_ICONS: Record<string, React.ReactNode> = {
  downstream_invalidated: (
    <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
  ),
  assumption_invalidated: (
    <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
  ),
  evidence_invalidated: (
    <GitPullRequest className="w-3.5 h-3.5 text-purple-400" />
  ),
  component_affected: (
    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
  ),
  alternative_reconsidered: (
    <ArrowRight className="w-3.5 h-3.5 text-blue-400" />
  ),
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "text-success",
  medium: "text-accent",
  low: "text-orange-400",
};

export function CounterfactualPanel() {
  const { state, dispatch } = useDemoContext();
  const { counterfactualResult: r, currentQuestion, mode } = state;

  if (mode !== "counterfactual" || !r) {
    return (
      <div className="flex items-center justify-center h-full text-text-tertiary text-small">
        Select a counterfactual question to begin.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 px-4 py-3 border-b border-border">
        <h3 className="text-small font-medium text-text-primary">
          Counterfactual Analysis
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Question */}
        <div className="px-4 py-4 border-b border-border">
          <p className="text-caption text-text-tertiary mb-1.5">Scenario</p>
          <p className="text-body text-text-primary font-medium leading-snug">
            {r.scenario}
          </p>
        </div>

        <div className="divide-y divide-border">
          {/* --- Observed Reality --- */}
          <Section
            title={r.observedReality.title}
            icon={<BarChart3 className="w-3.5 h-3.5 text-emerald-400" />}
            delay={0}
          >
            <p className="text-small text-text-secondary leading-relaxed mb-3">
              {r.observedReality.description}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {r.observedReality.nodeIds.slice(0, 6).map((id) => (
                <button
                  key={id}
                  onClick={() =>
                    dispatch({
                      type: "SET_CAMERA_TARGET",
                      target: { nodeId: id, zoom: 1.5 },
                    })
                  }
                  className="text-caption px-2 py-0.5 rounded border border-emerald-500/20 bg-emerald-500/5 text-emerald-300 hover:bg-emerald-500/10 transition-colors"
                >
                  {id.split(":").pop()?.replace(/-/g, " ").slice(0, 28) ?? id}
                </button>
              ))}
            </div>
          </Section>

          {/* --- Hypothetical Changes --- */}
          <Section
            title={r.hypotheticalChanges.title}
            icon={<ArrowRight className="w-3.5 h-3.5 text-purple-400" />}
            delay={0.1}
          >
            <p className="text-small text-text-secondary leading-relaxed mb-3">
              {r.hypotheticalChanges.description}
            </p>
            <div className="space-y-2">
              {r.hypotheticalChanges.changes.map((change, i) => (
                <HypotheticalChangeCard
                  key={i}
                  change={change}
                  index={i}
                  onFocus={(id) =>
                    dispatch({
                      type: "SET_CAMERA_TARGET",
                      target: { nodeId: id, zoom: 1.5 },
                    })
                  }
                />
              ))}
            </div>
          </Section>

          {/* --- Predicted Consequences --- */}
          <Section
            title={r.predictedConsequences.title}
            icon={
              <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
            }
            delay={0.2}
          >
            <p className="text-small text-text-secondary leading-relaxed mb-3">
              {r.predictedConsequences.description}
            </p>
            <div className="space-y-2">
              {r.predictedConsequences.consequences.map((c, i) => (
                <ConsequenceCard
                  key={i}
                  consequence={c}
                  index={i}
                  onFocus={(id) =>
                    dispatch({
                      type: "SET_CAMERA_TARGET",
                      target: { nodeId: id, zoom: 1.5 },
                    })
                  }
                />
              ))}
            </div>
            {r.predictedConsequences.affectedComponents.length > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-caption text-text-tertiary">
                  Components affected:
                </span>
                {r.predictedConsequences.affectedComponents.map((c) => (
                  <span
                    key={c}
                    className="text-caption px-2 py-0.5 rounded border border-orange-500/20 bg-orange-500/5 text-orange-300"
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}
          </Section>

          {/* --- Confidence --- */}
          <Section
            title="Confidence"
            icon={<BarChart3 className="w-3.5 h-3.5 text-accent" />}
            delay={0.3}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className={cn(
                  "text-caption font-medium px-2 py-0.5 rounded border",
                  r.confidence.level === "high"
                    ? "text-success border-success/20 bg-success/5"
                    : r.confidence.level === "medium"
                      ? "text-accent border-accent/20 bg-accent/5"
                      : "text-orange-400 border-orange-500/20 bg-orange-500/5",
                )}
              >
                {r.confidence.level}
              </span>
            </div>
            <p className="text-small text-text-secondary leading-relaxed">
              {r.confidence.rationale}
            </p>
          </Section>

          {/* --- Reasoning Summary --- */}
          <div className="px-4 py-4">
            <p className="text-caption text-text-tertiary mb-1">
              Reasoning Summary
            </p>
            <p className="text-small text-text-secondary leading-relaxed italic">
              {r.reasoningSummary}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function Section({
  title,
  icon,
  children,
  delay,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
      className="px-4 py-4"
    >
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h4 className="text-small font-medium text-text-primary">{title}</h4>
      </div>
      {children}
    </motion.div>
  );
}

function HypotheticalChangeCard({
  change,
  index,
  onFocus,
}: {
  change: HypotheticalChange;
  index: number;
  onFocus: (id: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="rounded-lg border border-purple-500/15 bg-purple-500/[0.03] p-3"
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5">
          {CHANGE_ICONS[change.type] ?? (
            <ArrowRight className="w-3.5 h-3.5 text-purple-400" />
          )}
        </span>
        <div className="flex-1 min-w-0">
          <button
            onClick={() => onFocus(change.nodeId)}
            className="text-small font-medium text-purple-200 hover:text-purple-100 transition-colors text-left"
          >
            {change.type === "reverted"
              ? "Reverted: "
              : change.type === "switched"
                ? "Viable: "
                : change.type === "modified"
                  ? "Modified: "
                  : "Invalidated: "}
            {change.label}
          </button>
          <p className="text-caption text-text-secondary mt-1 leading-relaxed">
            {change.description}
          </p>
          {change.evidenceUrls.length > 0 && (
            <div className="flex items-center gap-1 mt-1.5">
              {change.evidenceUrls.map((url) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-0.5 text-caption text-text-tertiary hover:text-accent transition-colors"
                >
                  <ExternalLink className="w-2.5 h-2.5" />
                  {url.split("/").pop()}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function ConsequenceCard({
  consequence,
  index,
  onFocus,
}: {
  consequence: PredictedConsequence;
  index: number;
  onFocus: (id: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="rounded-lg border border-orange-500/15 bg-orange-500/[0.03] p-3"
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5">
          {CONSEQUENCE_ICONS[consequence.type] ?? (
            <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
          )}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-small text-text-primary leading-relaxed flex-1">
              {consequence.description}
            </p>
            <span
              className={cn(
                "text-caption px-1.5 py-0.5 rounded border font-medium flex-shrink-0",
                consequence.confidence === "high"
                  ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300"
                  : "border-accent/20 bg-accent/5 text-accent",
              )}
            >
              {consequence.confidence}
            </span>
          </div>
          {consequence.nodeIds.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {consequence.nodeIds.map((id) => (
                <button
                  key={id}
                  onClick={() => onFocus(id)}
                  className="text-caption px-1.5 py-0.5 rounded border border-orange-500/10 bg-orange-500/[0.04] text-text-tertiary hover:text-orange-200 hover:border-orange-500/30 transition-colors"
                >
                  {id.split(":").pop()?.replace(/-/g, " ").slice(0, 24) ?? id}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
