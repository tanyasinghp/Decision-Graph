"use client";

import { cn } from "@/lib/utils";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center h-full text-center px-6",
        className,
      )}
    >
      <div className="mb-4 text-text-tertiary">
        {icon ?? <Inbox className="w-8 h-8" />}
      </div>
      <p className="text-body font-medium text-text-secondary mb-1">{title}</p>
      {description && (
        <p className="text-small text-text-tertiary max-w-xs">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
