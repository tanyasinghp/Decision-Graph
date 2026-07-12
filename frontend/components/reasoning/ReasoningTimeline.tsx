"use client";

import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDemoContext } from "@/lib/demo-context";
import { ReasoningEvent } from "./ReasoningEvent";
import { PhaseHeader } from "./PhaseHeader";
import { TimelineSkeleton } from "@/components/shared/Skeleton";
import { EmptyState } from "@/components/shared/EmptyState";

export function ReasoningTimeline() {
  const { state } = useDemoContext();
  const { timeline, mode } = state;
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [timeline.length]);

  if (mode === "loading") {
    return <TimelineSkeleton />;
  }

  if (timeline.length === 0) {
    return (
      <EmptyState
        icon={
          <svg
            className="w-8 h-8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        }
        title="Reasoning Timeline"
        description="Select a question and press Play to watch the system reconstruct decisions from the graph."
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 px-4 py-3 border-b border-border">
        <h3 className="text-small font-medium text-text-primary">
          Reasoning Trace
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="py-2">
          <AnimatePresence initial={false}>
            {timeline.map((event, i) => {
              if (event.t === "phase") {
                return <PhaseHeader key={i} name={event.name} />;
              }
              return (
                <ReasoningEvent
                  key={`${event.t}-${i}`}
                  event={event}
                  isLatest={i === timeline.length - 1}
                  index={i}
                />
              );
            })}
          </AnimatePresence>
        </div>

        {mode === "streaming" && (
          <div className="flex items-center gap-2 px-4 py-3 border-t border-border/50">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span className="text-caption text-text-tertiary">Processing...</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
