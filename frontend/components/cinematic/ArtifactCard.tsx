"use client";

/**
 * ArtifactCard — a realistic GitHub engineering-artifact card.
 *
 * Purely presentational: scenes wrap it in a motion element to position and
 * animate it. Styling mimics GitHub's dark surfaces (PRs, issues, commits),
 * plus RFC / Slack / doc variants, so the whole set reads as "engineering
 * memory" at a glance.
 */

import {
  GitPullRequest,
  CircleDot,
  GitCommit,
  FileText,
  MessageSquare,
  FileCode2,
  Check,
  type LucideIcon,
} from "lucide-react";
import { rgba, type ArtifactMeta } from "./tokens";

const ICONS: Record<string, LucideIcon> = {
  GitPullRequest,
  CircleDot,
  GitCommit,
  FileText,
  MessageSquare,
  FileCode2,
};

interface ArtifactCardProps {
  meta: ArtifactMeta;
  /** Slightly smaller footprint for dense scenes. */
  compact?: boolean;
  /** Extra glow intensity 0..1 for hero moments. */
  glow?: number;
}

export default function ArtifactCard({
  meta,
  compact = false,
  glow = 0,
}: ArtifactCardProps) {
  const Icon = ICONS[meta.icon] ?? FileText;
  const width = compact ? 224 : 268;

  return (
    <div
      className="relative rounded-xl backdrop-blur-sm"
      style={{
        width,
        padding: compact ? "12px 14px" : "14px 16px",
        background:
          "linear-gradient(180deg, rgba(24,24,27,0.92) 0%, rgba(16,16,18,0.92) 100%)",
        border: `1px solid ${rgba(meta.color, 0.28)}`,
        boxShadow: `0 8px 30px rgba(0,0,0,0.55), 0 0 ${
          14 + glow * 26
        }px ${rgba(meta.color, 0.12 + glow * 0.22)}`,
      }}
    >
      {/* top row: icon + ref + badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
            style={{
              background: rgba(meta.color, 0.14),
              border: `1px solid ${rgba(meta.color, 0.35)}`,
            }}
          >
            <Icon size={13} color={meta.color} strokeWidth={2.2} />
          </span>
          <span
            className="font-mono text-[11px] tracking-tight"
            style={{ color: rgba(meta.color, 0.9) }}
          >
            {meta.ref}
          </span>
        </div>
        <span
          className="flex items-center gap-1 rounded-full px-2 py-[2px] text-[10px] font-medium"
          style={{
            background: rgba(meta.color, 0.12),
            color: rgba(meta.color, 0.95),
            border: `1px solid ${rgba(meta.color, 0.3)}`,
          }}
        >
          {(meta.badge === "Merged" || meta.badge === "verified") && (
            <Check size={9} strokeWidth={3} />
          )}
          {meta.badge}
        </span>
      </div>

      {/* title */}
      <p
        className={`mt-2.5 font-semibold leading-snug ${
          compact ? "text-[12.5px]" : "text-[13.5px]"
        }`}
        style={{ color: "#e7e7ea", letterSpacing: "-0.01em" }}
      >
        {meta.title}
      </p>

      {/* context */}
      <p
        className="mt-1.5 truncate text-[11px]"
        style={{ color: "#8a8a92" }}
      >
        {meta.context}
      </p>
    </div>
  );
}
