"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const LEGEND_ITEMS = [
  { label: "Decision", color: "bg-amber-500", border: "border-amber-500/60" },
  { label: "Pull Request", color: "bg-emerald-500", border: "border-emerald-500/60" },
  { label: "Issue", color: "bg-blue-500", border: "border-blue-500/60" },
  { label: "Commit", color: "bg-purple-500", border: "border-purple-500/60" },
  { label: "Component", color: "bg-cyan-500", border: "border-cyan-500/60" },
];

const EDGE_LEGEND = [
  { label: "Supersedes", color: "bg-orange-500" },
  { label: "Supported by", color: "bg-emerald-500" },
  { label: "Rejected alt.", color: "bg-red-500" },
];

export function GraphLegend() {
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute bottom-3 left-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface/80 backdrop-blur-sm border border-border text-caption text-text-tertiary hover:text-text-secondary transition-colors"
      >
        Legend
        <ChevronDown
          className={cn(
            "w-3 h-3 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="mt-1.5 p-2.5 rounded-lg bg-surface/95 backdrop-blur-sm border border-border min-w-[140px] space-y-2">
          <div>
            <p className="text-caption text-text-tertiary mb-1.5 font-medium">
              Nodes
            </p>
            <div className="space-y-1">
              {LEGEND_ITEMS.map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <span
                    className={cn(
                      "w-2.5 h-2.5 rounded-sm border",
                      item.color,
                      item.border,
                    )}
                  />
                  <span className="text-caption text-text-secondary">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-caption text-text-tertiary mb-1.5 font-medium">
              Edges
            </p>
            <div className="space-y-1">
              {EDGE_LEGEND.map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <span className={cn("w-3 h-0.5 rounded", item.color)} />
                  <span className="text-caption text-text-secondary">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
