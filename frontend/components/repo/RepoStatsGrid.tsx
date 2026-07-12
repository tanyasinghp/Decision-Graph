"use client";

import { StatCard } from "./StatCard";

interface RepoStatsGridProps {
  commitCount: string;
  issueCount: string;
  prCount: string;
  decisionCount: string;
  confidence: string;
}

export function RepoStatsGrid({
  commitCount,
  issueCount,
  prCount,
  decisionCount,
  confidence,
}: RepoStatsGridProps) {
  return (
    <div className="grid grid-cols-5 gap-3">
      <StatCard label="Commits" value={commitCount} delay={0} />
      <StatCard label="Issues" value={issueCount} delay={0.05} />
      <StatCard label="Pull Requests" value={prCount} delay={0.1} />
      <StatCard label="Decisions" value={decisionCount} accent delay={0.15} />
      <StatCard label="Confidence" value={confidence} accent delay={0.2} />
    </div>
  );
}
