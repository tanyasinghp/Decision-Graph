"use client";

import { GitBranch, ArrowDown, Layers, Gauge } from "lucide-react";
import { useDemoContext } from "@/lib/demo-context";
import { cn } from "@/lib/utils";

/**
 * The counterfactual impact summary — right pane during counterfactual mode.
 * Exists because every pane must always earn its space (plan #7), and long
 * scenario prose belongs in the center; the right pane is the SCAN copy:
 *
 *   Observation → Change → Impact → Confidence
 *
 * one line each, chips for components, a badge for confidence. During a live
 * demo this pane is readable from the back of the room.
 */
export function CounterfactualSummary() {
  const { state } = useDemoContext();
  const result = state.counterfactualResult;

  if (!result) {
    return (
      <div className="h-full flex items-center justify-center px-6">
        <p className="text-small text-text-tertiary">Computing scenario…</p>
      </div>
    );
  }

  const confColor =
    result.confidence.level === "high"
      ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/10"
      : result.confidence.level === "medium"
        ? "text-amber-400 border-amber-400/30 bg-amber-400/10"
        : "text-zinc-400 border-zinc-400/30 bg-zinc-400/10";

  return (
    <div className="h-full overflow-y-auto px-5 py-4 space-y-5">
      <p className="text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
        Impact summary
      </p>

      <Step
        icon={<Layers className="w-3.5 h-3.5 text-zinc-400" />}
        label="Observation"
        body={result.observedReality.description}
      />
      <Connector />
      <Step
        icon={<GitBranch className="w-3.5 h-3.5 text-purple-400" />}
        label="Change"
        body={result.hypotheticalChanges.description}
        accent="border-purple-500/20"
      />
      <Connector />
      <Step
        icon={<ArrowDown className="w-3.5 h-3.5 text-orange-400" />}
        label="Impact"
        body={result.predictedConsequences.description}
        accent="border-orange-500/20"
      >
        {result.predictedConsequences.affectedComponents.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {result.predictedConsequences.affectedComponents.map((c) => (
              <span
                key={c}
                className="text-[10px] px-2 py-0.5 rounded-full border border-cyan-400/25 text-cyan-300/90 bg-cyan-400/5"
              >
                {c}
              </span>
            ))}
          </div>
        )}
      </Step>
      <Connector />
      <Step
        icon={<Gauge className="w-3.5 h-3.5 text-text-secondary" />}
        label="Confidence"
        body={result.confidence.rationale}
      >
        <span
          className={cn(
            "inline-block mt-2 text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded border",
            confColor,
          )}
        >
          {result.confidence.level}
        </span>
      </Step>

      <p className="text-caption text-text-tertiary/70 pt-2 border-t border-border leading-relaxed">
        Hypothetical nodes (dashed purple) and predicted consequences (dashed
        amber) are overlaid on the observed graph — reality stays visible
        underneath.
      </p>
    </div>
  );
}

function Step({
  icon,
  label,
  body,
  accent,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  body: string;
  accent?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-lg border border-border px-3.5 py-3", accent)}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
          {label}
        </span>
      </div>
      <p className="text-small text-text-secondary leading-snug line-clamp-3">{body}</p>
      {children}
    </div>
  );
}

function Connector() {
  return (
    <div className="flex justify-center -my-3">
      <div className="w-px h-4 bg-border" />
    </div>
  );
}
