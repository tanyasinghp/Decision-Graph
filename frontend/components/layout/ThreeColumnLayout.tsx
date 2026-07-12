"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ThreeColumnLayoutProps {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  className?: string;
  visible: boolean;
}

export function ThreeColumnLayout({
  left,
  center,
  right,
  className,
  visible,
}: ThreeColumnLayoutProps) {
  if (!visible) return null;

  return (
    <div
      className={cn(
        "flex-1 grid grid-cols-[2fr_2fr_1.8fr] gap-0 overflow-hidden",
        className,
      )}
    >
      {/* Left: Graph */}
      <div className="border-r border-border min-h-0 overflow-hidden">
        {left}
      </div>

      {/* Center: Timeline */}
      <div className="border-r border-border min-h-0 overflow-hidden">
        {center}
      </div>

      {/* Right: Answer */}
      <div className="min-h-0 overflow-hidden">
        {right}
      </div>
    </div>
  );
}
