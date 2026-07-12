"use client";

import { Play, Square, RotateCcw, ChevronDown } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { DemoExample } from "@/lib/types";

interface DemoControlsProps {
  examples: DemoExample[];
  selectedExample: DemoExample | null;
  onSelectExample: (example: DemoExample) => void;
  isPlaying: boolean;
  speed: number;
  onSpeedChange: (speed: number) => void;
  onPlay: () => void;
  onStop: () => void;
  onReset: () => void;
  progress?: number;
  totalEvents?: number;
  disabled?: boolean;
}

const SPEEDS = [0.5, 1, 2];

export function DemoControls({
  examples,
  selectedExample,
  onSelectExample,
  isPlaying,
  speed,
  onSpeedChange,
  onPlay,
  onStop,
  onReset,
  progress = 0,
  totalEvents = 0,
  disabled,
}: DemoControlsProps) {
  const exList = examples ?? [];
  const canPlay = selectedExample && !disabled;
  const showProgress = progress > 0 && totalEvents > 0;

  return (
    <div className="flex items-center gap-3">
      {/* Question selector */}
      <div className="relative flex-1">
        <select
          value={selectedExample?.id ?? ""}
          onChange={(e) => {
            const ex = exList.find((x) => x.id === e.target.value);
            if (ex) onSelectExample(ex);
          }}
          disabled={isPlaying}
          className={cn(
            "w-full appearance-none rounded-lg border border-border bg-surface px-3 py-2 pr-8",
            "text-small text-text-primary",
            "focus:outline-none focus:ring-1 focus:ring-accent/50 focus:border-accent/50",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "transition-colors duration-200",
          )}
        >
          <option value="" disabled>
            Select a question...
          </option>
          {exList.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.question}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary pointer-events-none" />
      </div>

      {/* Play / Stop */}
      <button
        onClick={isPlaying ? onStop : onPlay}
        disabled={!canPlay && !isPlaying}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg",
          "text-small font-medium transition-all duration-200",
          isPlaying
            ? "bg-error/10 text-error hover:bg-error/20"
            : "bg-accent/10 text-accent hover:bg-accent/20 active:bg-accent/30",
          "disabled:opacity-30 disabled:cursor-not-allowed",
        )}
        title={isPlaying ? "Stop" : "Play"}
      >
        {isPlaying ? (
          <>
            <Square className="w-3.5 h-3.5" />
            Stop
          </>
        ) : (
          <>
            <Play className="w-3.5 h-3.5" />
            Play
          </>
        )}
      </button>

      {/* Progress bar */}
      {showProgress && (
        <div className="flex items-center gap-2 min-w-[80px]">
          <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-accent"
              initial={{ width: 0 }}
              animate={{ width: `${(progress / totalEvents) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <span className="text-caption text-text-tertiary tabular-nums min-w-[3ch] text-right">
            {Math.round((progress / totalEvents) * 100)}%
          </span>
        </div>
      )}

      {/* Speed */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-0.5">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            disabled={isPlaying}
            className={cn(
              "px-2 py-1 rounded-md text-caption font-medium transition-all duration-200",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              speed === s
                ? "bg-accent/20 text-accent"
                : "text-text-tertiary hover:text-text-secondary",
            )}
          >
            {s}x
          </button>
        ))}
      </div>

      {/* Reset */}
      <button
        onClick={onReset}
        disabled={disabled && !isPlaying}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg",
          "text-small text-text-tertiary hover:text-text-secondary",
          "transition-colors duration-200",
          "disabled:opacity-30 disabled:cursor-not-allowed",
        )}
        title="Reset"
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
