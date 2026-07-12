"use client";

import { memo, useCallback } from "react";
import { motion } from "framer-motion";
import {
  GitPullRequest,
  CircleDot,
  GitCommit,
  MessageCircle,
  FileText,
  ExternalLink,
} from "lucide-react";
import { useDemoContext } from "@/lib/demo-context";
import { cn, truncate } from "@/lib/utils";
import { getEdgeTypeLabel } from "@/lib/types";
import type { EvidenceCardData } from "@/lib/types";

const KIND_ICONS: Record<string, React.ReactNode> = {
  pr: <GitPullRequest className="w-3.5 h-3.5" />,
  issue: <CircleDot className="w-3.5 h-3.5" />,
  commit: <GitCommit className="w-3.5 h-3.5" />,
  discussion: <MessageCircle className="w-3.5 h-3.5" />,
  doc: <FileText className="w-3.5 h-3.5" />,
  rfc: <FileText className="w-3.5 h-3.5" />,
};

const KIND_COLORS: Record<string, string> = {
  pr: "text-emerald-400",
  issue: "text-blue-400",
  commit: "text-purple-400",
  discussion: "text-violet-400",
  doc: "text-cyan-400",
  rfc: "text-amber-400",
};

const KIND_BG: Record<string, string> = {
  pr: "bg-emerald-500/10 border-emerald-500/20",
  issue: "bg-blue-500/10 border-blue-500/20",
  commit: "bg-purple-500/10 border-purple-500/20",
  discussion: "bg-violet-500/10 border-violet-500/20",
  doc: "bg-cyan-500/10 border-cyan-500/20",
  rfc: "bg-amber-500/10 border-amber-500/20",
};

const CONFIDENCE_STYLES: Record<string, string> = {
  high: "bg-success/10 text-success border-success/20",
  medium: "bg-accent/10 text-accent border-accent/20",
  low: "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

interface EvidenceCardProps {
  card: EvidenceCardData;
  index: number;
}

function EvidenceCardInner({ card, index }: EvidenceCardProps) {
  const { state, dispatch } = useDemoContext();
  const isHighlighted = state.highlightedEvidenceId === card.id;

  const handleMouseEnter = useCallback(() => {
    dispatch({ type: "HIGHLIGHT_EVIDENCE", id: card.id });
    dispatch({
      type: "HIGHLIGHT_NODES",
      ids: card.associatedNodeIds,
    });
    // Highlight edges connected to associated nodes
    const edges: string[] = [];
    if (state.graph) {
      for (const nodeId of card.associatedNodeIds) {
        for (const e of state.graph.edges({ from: nodeId })) {
          edges.push(e.id);
        }
        for (const e of state.graph.edges({ to: nodeId })) {
          edges.push(e.id);
        }
      }
    }
    if (edges.length > 0) {
      dispatch({ type: "HIGHLIGHT_EDGES", ids: edges });
    }
  }, [dispatch, card.id, card.associatedNodeIds, state.graph]);

  const handleMouseLeave = useCallback(() => {
    dispatch({ type: "HIGHLIGHT_EVIDENCE", id: null });
    dispatch({ type: "HIGHLIGHT_NODES", ids: [] });
    dispatch({ type: "HIGHLIGHT_EDGES", ids: [] });
  }, [dispatch]);

  const handleClick = useCallback(() => {
    // Focus graph on the source decision
    dispatch({
      type: "SET_CAMERA_TARGET",
      target: { nodeId: card.sourceDecisionId, zoom: 1.5 },
    });
    dispatch({
      type: "HIGHLIGHT_NODES",
      ids: card.associatedNodeIds,
    });
    // Highlight edges
    const edges: string[] = [];
    if (state.graph) {
      for (const nodeId of card.associatedNodeIds) {
        for (const e of state.graph.edges({ from: nodeId })) {
          edges.push(e.id);
        }
        for (const e of state.graph.edges({ to: nodeId })) {
          edges.push(e.id);
        }
      }
    }
    if (edges.length > 0) {
      dispatch({ type: "HIGHLIGHT_EDGES", ids: edges });
    }
    // Scroll timeline to the event that introduced this evidence
    if (card.timelineEventIndex !== null) {
      const timelineEl = document.querySelector(
        `[data-timeline-index="${card.timelineEventIndex}"]`,
      );
      timelineEl?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [dispatch, card, state.graph]);

  const icon = KIND_ICONS[card.kind] ?? <FileText className="w-3.5 h-3.5" />;
  const iconColor = KIND_COLORS[card.kind] ?? "text-text-tertiary";
  const cardBg = KIND_BG[card.kind] ?? "bg-subtle border-subtle";
  const confStyle =
    CONFIDENCE_STYLES[card.confidence] ?? CONFIDENCE_STYLES.medium;

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{
        duration: 0.4,
        delay: index * 0.05,
        ease: [0.16, 1, 0.3, 1],
      }}
      layout
      className={cn(
        "rounded-lg border transition-all duration-300 cursor-pointer",
        cardBg,
        isHighlighted && "ring-1 ring-accent/40 shadow-lg shadow-accent/5",
        !isHighlighted && "hover:border-accent/30",
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      <div className="p-3 space-y-2">
        {/* Header: Icon + Kind + Confidence */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn("flex-shrink-0", iconColor)}>{icon}</span>
            <span className="text-caption font-medium text-text-secondary">
              {card.kind === "pr"
                ? "Pull Request"
                : card.kind === "rfc"
                  ? "RFC"
                  : card.kind.charAt(0).toUpperCase() + card.kind.slice(1)}
            </span>
          </div>
          <span
            className={cn(
              "text-caption px-1.5 py-0.5 rounded border font-medium",
              confStyle,
            )}
          >
            {card.confidence}
          </span>
        </div>

        {/* Title */}
        <p className="text-small text-text-primary font-medium leading-snug line-clamp-2">
          {card.title}
        </p>

        {/* Excerpt */}
        <p className="text-caption text-text-tertiary leading-relaxed line-clamp-2">
          {truncate(card.excerpt, 140)}
        </p>

        {/* Provenance chain */}
        <div className="flex items-center gap-1.5 text-caption text-text-tertiary pt-0.5">
          <span className="text-text-secondary font-medium truncate max-w-[120px]">
            {card.url.split("/").pop()}
          </span>
          <span className="text-text-tertiary/60">→</span>
          <span className="text-accent/80 font-medium">
            {getEdgeTypeLabel(card.relationType)}
          </span>
          <span className="text-text-tertiary/60">→</span>
          <span className="text-text-secondary truncate max-w-[120px]">
            {card.sourceDecisionLabel.length > 25
              ? card.sourceDecisionLabel.slice(0, 25) + "…"
              : card.sourceDecisionLabel}
          </span>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-caption text-text-tertiary pt-0.5 border-t border-border/50">
          <span className="truncate">
            {card.url.replace("https://github.com/", "")}
          </span>
          <a
            href={card.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex-shrink-0 p-0.5 hover:text-accent transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </motion.div>
  );
}

export const EvidenceCard = memo(EvidenceCardInner);
