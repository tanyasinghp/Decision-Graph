"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import { getNodeHexColor } from "@/lib/graph-utils";
import type { FlowNodeData } from "@/lib/graph-utils";

function DecisionNodeInner({ data }: NodeProps<FlowNodeData>) {
  const { label, nodeType, confidence, state, node } = data;
  const isComponent = nodeType === "component";
  const color = getNodeHexColor(nodeType);

  const stateStyles = getStateStyles(state, color);
  const extraStyle = getExtraStyle(state, color);

  if (isComponent) {
    return (
      <div
        className={cn(
          "px-4 py-2 rounded-full border-2 transition-all duration-500",
          "bg-[#0a0a0b]",
          stateStyles.border,
          stateStyles.opacity,
          stateStyles.glow,
        )}
      >
        <Handle
          type="source"
          position={Position.Right}
          className="!bg-transparent !border-0"
        />
        <Handle
          type="target"
          position={Position.Left}
          className="!bg-transparent !border-0"
        />
        <span
          className={cn(
            "text-small font-medium whitespace-nowrap transition-colors duration-500",
            stateStyles.textColor,
          )}
        >
          {label}
        </span>
      </div>
    );
  }

  const isDecision = nodeType === "decision";

  return (
    <div
      className={cn(
        "rounded-xl border-2 transition-all duration-500",
        "bg-[#0a0a0b]",
        stateStyles.border,
        stateStyles.opacity,
        stateStyles.glow,
        isDecision ? "px-4 py-3 min-w-[200px]" : "px-3 py-2 min-w-[160px]",
      )}
      style={extraStyle}
    >
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-transparent !border-0"
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-transparent !border-0"
      />

      <div className="flex items-start gap-2.5">
        <div
          className={cn(
            "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors duration-500",
            stateStyles.badgeBg,
          )}
        >
          {isDecision ? (
            <Brain className="w-3.5 h-3.5" style={{ color }} />
          ) : (
            <span className="text-caption font-bold" style={{ color }}>
              #
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {!isDecision && (
              <span
                className="text-caption font-medium px-1 py-0.5 rounded"
                style={{
                  backgroundColor: `${color}15`,
                  color: color,
                }}
              >
                {nodeType === "pull_request"
                  ? "PR"
                  : nodeType === "issue"
                    ? "ISSUE"
                    : nodeType === "commit"
                      ? "COMMIT"
                      : nodeType.toUpperCase()}
              </span>
            )}
          </div>
          <p
            className={cn(
              "text-small leading-snug transition-colors duration-500",
              isDecision ? "font-medium" : "text-small",
              stateStyles.textColor,
            )}
          >
            {label}
          </p>

          {isDecision && confidence && (
            <div className="flex items-center gap-2 mt-1.5">
              <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width:
                      confidence === "high"
                        ? "90%"
                        : confidence === "medium"
                          ? "60%"
                          : "30%",
                    backgroundColor: color,
                    opacity: state === "dim" ? 0.3 : 0.8,
                  }}
                />
              </div>
              <span
                className="text-caption"
                style={{ color, opacity: state === "dim" ? 0.4 : 0.8 }}
              >
                {confidence}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getStateStyles(
  state: FlowNodeData["state"],
  color: string,
): {
  border: string;
  opacity: string;
  glow: string;
  textColor: string;
  badgeBg: string;
} {
  switch (state) {
    case "focused":
      return {
        border: `border-transparent`,
        opacity: "opacity-100",
        glow: "animate-pulse-glow",
        textColor: "text-text-primary",
        badgeBg: "bg-accent/15",
      };
    case "highlighted":
      return {
        border: "border-accent/40",
        opacity: "opacity-90",
        glow: "",
        textColor: "text-text-primary",
        badgeBg: "bg-accent/10",
      };
    case "visited":
      return {
        border: "border-border/40",
        opacity: "opacity-70",
        glow: "",
        textColor: "text-text-secondary",
        badgeBg: "bg-white/5",
      };
    case "visible":
      return {
        border: "border-border",
        opacity: "opacity-60",
        glow: "",
        textColor: "text-text-secondary",
        badgeBg: "bg-white/5",
      };
    case "dim":
      return {
        border: "border-border/30",
        opacity: "opacity-25",
        glow: "",
        textColor: "text-text-tertiary",
        badgeBg: "bg-white/[0.02]",
      };
    case "hypothetical":
      return {
        border: "border-dashed border-purple-500/40",
        opacity: "opacity-60",
        glow: "",
        textColor: "text-purple-300",
        badgeBg: "bg-purple-500/10",
      };
    case "predicted":
      return {
        border: "border-dashed border-orange-500/40",
        opacity: "opacity-70",
        glow: "",
        textColor: "text-orange-200",
        badgeBg: "bg-orange-500/10",
      };
  }
}

function getExtraStyle(
  state: FlowNodeData["state"],
  color: string,
): React.CSSProperties | undefined {
  if (state === "focused") {
    return { boxShadow: `0 0 24px ${color}50, 0 0 48px ${color}25` };
  }
  if (state === "visited") {
    return { borderColor: `${color}33` };
  }
  return undefined;
}

export const DecisionNode = memo(DecisionNodeInner);
