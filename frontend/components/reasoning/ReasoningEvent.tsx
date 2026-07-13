"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import {
  Search,
  GitMerge,
  MessageCircle,
  FileText,
  CheckCircle,
  XCircle,
  ArrowRight,
  Shield,
  Zap,
  Brain,
  Play,
  Flag,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RunEvent } from "@/lib/types";
import { getEventIcon } from "@/hooks/useReasoningStream";
import { narrateEvent } from "@/lib/narrate";

interface ReasoningEventProps {
  event: RunEvent;
  isLatest: boolean;
  index: number;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  phase: <Flag className="w-3.5 h-3.5" />,
  search: <Search className="w-3.5 h-3.5" />,
  traverse: <ArrowRight className="w-3.5 h-3.5" />,
  evidence: <FileText className="w-3.5 h-3.5" />,
  decision: <Brain className="w-3.5 h-3.5" />,
  rejected: <XCircle className="w-3.5 h-3.5" />,
  answer: <CheckCircle className="w-3.5 h-3.5" />,
  result: <Loader2 className="w-3.5 h-3.5" />,
  text: <MessageCircle className="w-3.5 h-3.5" />,
  guard: <Shield className="w-3.5 h-3.5" />,
  start: <Play className="w-3.5 h-3.5" />,
  complete: <CheckCircle className="w-3.5 h-3.5" />,
  failed: <XCircle className="w-3.5 h-3.5" />,
  tool: <Zap className="w-3.5 h-3.5" />,
};

function getEventColor(event: RunEvent): string {
  switch (event.t) {
    case "phase":
      return "text-accent";
    case "tool_call":
      if (event.name === "record_answer") return "text-success";
      if (event.name === "traverse") return "text-orange-400";
      if (event.name === "get_evidence") return "text-info";
      if (event.name === "search_decisions") return "text-text-secondary";
      return "text-text-secondary";
    case "tool_result":
      return event.isError ? "text-error" : "text-text-secondary";
    case "decision_emitted":
      return "text-accent";
    case "decision_rejected":
      return "text-error";
    case "assistant_text":
      return "text-text-secondary";
    case "guard_hit":
      return "text-error";
    case "run_started":
      return "text-text-tertiary";
    case "run_finished":
      return event.status === "completed" ? "text-success" : "text-error";
    default:
      return "text-text-tertiary";
  }
}

function getEventBg(event: RunEvent): string {
  switch (event.t) {
    case "tool_call":
      if (event.name === "record_answer")
        return "bg-success/5 border-success/15";
      return "bg-subtle border-subtle";
    case "decision_emitted":
      return "bg-accent/5 border-accent/15";
    case "tool_result":
      if (event.isError) return "bg-error/5 border-error/15";
      return "bg-subtle border-subtle";
    default:
      return "";
  }
}

export const ReasoningEvent = memo(function ReasoningEvent({ event, isLatest, index }: ReasoningEventProps) {
  const iconKey = getEventIcon(event);
  const icon = ICON_MAP[iconKey] ?? <Zap className="w-3.5 h-3.5" />;
  const color = getEventColor(event);
  const bg = getEventBg(event);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.3,
        ease: [0.16, 1, 0.3, 1],
      }}
      data-timeline-index={index}
      className={cn(
        "group relative flex items-start gap-3 px-4 py-2.5",
        "transition-colors duration-200",
        bg,
        isLatest && event.t !== "phase" && "bg-accent/[0.02]",
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center",
          "border transition-all duration-300",
          event.t === "phase"
            ? "border-accent/30 bg-accent/10"
            : isLatest
              ? cn("border-accent/20 bg-accent/5", color)
              : "border-border bg-surface",
        )}
      >
        <span className={cn("transition-colors duration-300", color)}>
          {isLatest && event.t !== "phase" ? (
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent/20" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-accent/30" />
            </span>
          ) : (
            icon
          )}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pt-0.5">
        <p
          className={cn(
            "text-small leading-snug",
            event.t === "phase"
              ? "text-text-primary font-medium"
              : event.t === "assistant_text"
                ? "text-text-secondary italic"
                : "text-text-secondary",
          )}
        >
          {narrateEvent(event)}
        </p>
      </div>
    </motion.div>
  );
});
