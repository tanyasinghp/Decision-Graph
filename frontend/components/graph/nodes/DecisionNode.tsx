"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import { getNodeHexColor, getBadgeHexColor } from "@/lib/graph-utils";
import type { FlowNodeData } from "@/lib/graph-utils";

/**
 * Four-directional invisible handles so the strata layout can route edges
 * from the correct face: spine relations (SUPERSEDES) leave left/right and
 * read as time; inter-band relations (evidence, components) leave top/bottom
 * and read as hierarchy. Handle ids match buildLayout's assignments.
 */
function OmniHandles() {
  const cls = "!bg-transparent !border-0 !w-1 !h-1 !min-w-0 !min-h-0";
  return (
    <>
      <Handle id="s-t" type="source" position={Position.Top} className={cls} />
      <Handle id="s-b" type="source" position={Position.Bottom} className={cls} />
      <Handle id="s-l" type="source" position={Position.Left} className={cls} />
      <Handle id="s-r" type="source" position={Position.Right} className={cls} />
      <Handle id="t-t" type="target" position={Position.Top} className={cls} />
      <Handle id="t-b" type="target" position={Position.Bottom} className={cls} />
      <Handle id="t-l" type="target" position={Position.Left} className={cls} />
      <Handle id="t-r" type="target" position={Position.Right} className={cls} />
    </>
  );
}

function DecisionNodeInner({ data }: NodeProps<FlowNodeData>) {
  const { label, nodeType, confidence, state, year } = data;
  const isComponent = nodeType === "component";
  const isDecision = nodeType === "decision";
  const color = getNodeHexColor(nodeType);
  const badgeColor = getBadgeHexColor(nodeType);

  const s = getStateStyles(state, color);

  if (isComponent) {
    return (
      <div
        className={cn(
          "px-4 py-2 rounded-full border transition-all duration-500 bg-[#0a0a0b]",
          s.border, s.opacity, s.glow,
        )}
        style={{ borderColor: state === "dim" ? undefined : `${color}55` }}
      >
        <OmniHandles />
        <span className={cn("text-small font-medium whitespace-nowrap transition-colors duration-500", s.textColor)}>
          {label}
        </span>
      </div>
    );
  }

  /* HIERARCHY (§13): decisions are the largest, loudest objects on the
     canvas — 2-line 14px/500 with confidence bar and year chip. Evidence
     artifacts are compact one-liners whose type badge carries the color. */
  return (
    <div
      className={cn(
        "rounded-xl border-2 transition-all duration-500 bg-[#0a0a0b]",
        s.border, s.opacity, s.glow,
        isDecision ? "px-4 py-3 w-[260px]" : "px-3 py-2 w-[190px]",
      )}
      style={getExtraStyle(state, color)}
    >
      <OmniHandles />

      <div className="flex items-start gap-2.5">
        {isDecision && (
          <div className={cn("flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors duration-500", s.badgeBg)}>
            <Brain className="w-3.5 h-3.5" style={{ color }} />
          </div>
        )}

        <div className="flex-1 min-w-0">
          {!isDecision && (
            <div className="flex items-center gap-2 mb-0.5">
              <span
                className="text-[10px] font-semibold tracking-[0.08em] px-1 py-0.5 rounded"
                style={{ backgroundColor: `${badgeColor}18`, color: badgeColor }}
              >
                {nodeType === "pull_request" ? "PR" : nodeType.toUpperCase().replace("_", " ")}
              </span>
            </div>
          )}

          <p
            className={cn(
              "leading-snug transition-colors duration-500",
              isDecision ? "text-[14px] font-medium line-clamp-2" : "text-[12px] line-clamp-1",
              s.textColor,
            )}
          >
            {label}
          </p>

          {isDecision && (
            <div className="flex items-center gap-2 mt-1.5">
              {confidence && (
                <>
                  <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: confidence === "high" ? "90%" : confidence === "medium" ? "60%" : "30%",
                        backgroundColor: color,
                        opacity: state === "dim" ? 0.3 : 0.8,
                      }}
                    />
                  </div>
                  <span className="text-[10px]" style={{ color, opacity: state === "dim" ? 0.4 : 0.8 }}>
                    {confidence}
                  </span>
                </>
              )}
              {year && (
                /* Year chip — the time axis, legible per-node (§9). */
                <span className="text-[10px] uppercase tracking-[0.14em] text-text-tertiary tabular-nums">
                  {year}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Four-tier visibility (§6): nothing disappears; weight communicates role.
 *   focused 1.0 + the ONLY glow · highlighted 1.0 · visited 0.75
 *   faded (frontier) 0.45 · dim (unrelated) 0.22 · visible = rest state
 */
function getStateStyles(state: FlowNodeData["state"], color: string) {
  switch (state) {
    case "focused":
      return { border: "border-transparent", opacity: "opacity-100", glow: "", textColor: "text-text-primary", badgeBg: "bg-accent/15" };
    case "highlighted":
      return { border: "border-accent/50", opacity: "opacity-100", glow: "", textColor: "text-text-primary", badgeBg: "bg-accent/10" };
    case "visited":
      return { border: "border-border/60", opacity: "opacity-75", glow: "", textColor: "text-text-secondary", badgeBg: "bg-white/5" };
    case "faded":
      return { border: "border-border/40", opacity: "opacity-45", glow: "", textColor: "text-text-tertiary", badgeBg: "bg-white/[0.03]" };
    case "visible":
      return { border: "border-border", opacity: "opacity-70", glow: "", textColor: "text-text-secondary", badgeBg: "bg-white/5" };
    case "dim":
      return { border: "border-border/25", opacity: "opacity-[0.22]", glow: "", textColor: "text-text-tertiary", badgeBg: "bg-white/[0.02]" };
    case "hypothetical":
      return { border: "border-dashed border-purple-500/50", opacity: "opacity-80", glow: "", textColor: "text-purple-300", badgeBg: "bg-purple-500/10" };
    case "predicted":
      return { border: "border-dashed border-orange-500/50", opacity: "opacity-80", glow: "", textColor: "text-orange-200", badgeBg: "bg-orange-500/10" };
  }
}

function getExtraStyle(state: FlowNodeData["state"], color: string): React.CSSProperties | undefined {
  if (state === "focused") {
    // The single glow on screen — attention has exactly one home (§12).
    return { boxShadow: `0 0 24px ${color}50, 0 0 48px ${color}25`, borderColor: `${color}cc` };
  }
  if (state === "visited") {
    return { borderColor: `${color}33` };
  }
  return undefined;
}

export const DecisionNode = memo(DecisionNodeInner);
