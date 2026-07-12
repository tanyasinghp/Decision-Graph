"use client";

import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
  variant?: "text" | "card" | "circle" | "rect";
  width?: string | number;
  height?: string | number;
}

export function Skeleton({ className, variant = "text", width, height }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse bg-surface-hover/50 rounded-md",
        variant === "circle" && "rounded-full",
        variant === "card" && "rounded-xl",
        className,
      )}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface px-5 py-4">
      <Skeleton variant="text" className="h-8 w-16 mb-2" />
      <Skeleton variant="text" className="h-4 w-20" />
    </div>
  );
}

export function TimelineSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton variant="text" className="h-4 w-32" />
      <div className="space-y-3 pl-4">
        <Skeleton variant="text" className="h-5 w-3/4" />
        <Skeleton variant="text" className="h-5 w-2/3" />
        <Skeleton variant="text" className="h-5 w-4/5" />
        <Skeleton variant="text" className="h-5 w-1/2" />
      </div>
    </div>
  );
}

export function AnswerPanelSkeleton() {
  return (
    <div className="space-y-6 p-4">
      <div>
        <Skeleton variant="text" className="h-4 w-24 mb-2" />
        <Skeleton variant="text" className="h-6 w-full mb-1" />
        <Skeleton variant="text" className="h-6 w-4/5" />
      </div>
      <div>
        <Skeleton variant="text" className="h-4 w-32 mb-2" />
        <Skeleton variant="card" className="h-24 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton variant="text" className="h-4 w-28" />
        <Skeleton variant="text" className="h-4 w-40" />
        <Skeleton variant="text" className="h-4 w-36" />
      </div>
    </div>
  );
}
