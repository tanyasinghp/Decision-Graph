"use client";

import { GitBranch, Activity } from "lucide-react";
import { useDemoContext } from "@/lib/demo-context";
import { cn } from "@/lib/utils";
import Link from "next/link";

export function AppHeader() {
  const { state } = useDemoContext();
  const { repo, mode } = state;

  return (
    <header className="border-b border-border bg-[#0a0a0b]/80 backdrop-blur-xl sticky top-0 z-40">
      <div className="max-w-[1600px] mx-auto px-page h-12 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-small font-medium text-text-primary hover:text-accent transition-colors">
            Decision Graph
          </Link>
          {repo && (
            <>
              <span className="text-text-tertiary text-caption">/</span>
              <div className="flex items-center gap-2">
                <GitBranch className="w-3.5 h-3.5 text-text-tertiary" />
                <span className="text-small text-text-secondary">{repo.repo}</span>
                <span className="text-caption text-text-tertiary px-1.5 py-0.5 rounded border border-border">
                  {repo.branch}
                </span>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          {mode !== "idle" && mode !== "loading" && (
            <span className="flex items-center gap-1.5 text-caption text-text-tertiary">
              <span className={cn(
                "w-1.5 h-1.5 rounded-full",
                mode === "streaming" ? "bg-accent animate-pulse" :
                mode === "complete" ? "bg-success" :
                "bg-text-tertiary"
              )} />
              {mode === "ready" && "Ready"}
              {mode === "streaming" && "Reasoning"}
              {mode === "answering" && "Answering"}
              {mode === "complete" && "Complete"}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
