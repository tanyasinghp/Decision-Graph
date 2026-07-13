/**
 * Shared cinematic design tokens.
 *
 * Every scene under /cinematic imports from this file so the whole "film"
 * shares one visual language: colors, lighting, motion springs, easing and
 * timing. Scenes stay independent (each is refresh-replayable) but feel like
 * they belong together.
 */

import type { Transition } from "framer-motion";

/* ------------------------------------------------------------------ *
 * Palette — matches the app's dark amber/emerald/blue/purple system.
 * ------------------------------------------------------------------ */

export const STAGE_BG = "#050506";

export const palette = {
  bg: STAGE_BG,
  ink: "#fafafa",
  inkDim: "#a1a1aa",
  inkFaint: "#52525b",
  amber: "#f59e0b",
  emerald: "#10b981",
  blue: "#3b82f6",
  purple: "#a855f7",
  red: "#ef4444",
  slate: "#94a3b8",
} as const;

/* ------------------------------------------------------------------ *
 * Motion — consistent springs & easing so nothing feels out of place.
 * ------------------------------------------------------------------ */

/** Subtle, expensive-feeling spring for cards entering. */
export const springSoft: Transition = {
  type: "spring",
  stiffness: 120,
  damping: 16,
  mass: 0.9,
};

/** Snappier spring for clustering / graph formation. */
export const springSnappy: Transition = {
  type: "spring",
  stiffness: 180,
  damping: 20,
  mass: 0.7,
};

/** Loose, heavy spring for physics-like scatter. */
export const springScatter: Transition = {
  type: "spring",
  stiffness: 45,
  damping: 12,
  mass: 1.2,
};

/** Apple-keynote easing curve (slow-in, decisive-out). */
export const easeKeynote = [0.16, 1, 0.3, 1] as const;

/** Cinematic camera easing — very gentle. */
export const easeCamera = [0.4, 0, 0.2, 1] as const;

export const timing = {
  stagger: 0.25, // 250ms per spec
  textIn: 1.1,
  textHold: 1.8,
  textOut: 0.7,
} as const;

/* ------------------------------------------------------------------ *
 * GitHub engineering artifacts — realistic metadata & styling.
 * ------------------------------------------------------------------ */

export type ArtifactKind =
  | "pr"
  | "issue"
  | "commit"
  | "rfc"
  | "slack"
  | "doc";

export interface ArtifactMeta {
  kind: ArtifactKind;
  /** lucide-react icon name */
  icon: string;
  color: string;
  /** small monospaced ref shown top-left, e.g. #1284 */
  ref: string;
  title: string;
  /** context line, e.g. author + repo */
  context: string;
  badge: string;
}

export const ARTIFACTS: ArtifactMeta[] = [
  {
    kind: "pr",
    icon: "GitPullRequest",
    color: palette.emerald,
    ref: "#1284",
    title: "Refactor Dropdown to use custom listbox",
    context: "anmol · razorpay/blade",
    badge: "Merged",
  },
  {
    kind: "issue",
    icon: "CircleDot",
    color: palette.emerald,
    ref: "#1092",
    title: "Dropdown fails a11y audit on iOS Safari",
    context: "kamlesh · opened 3 weeks ago",
    badge: "Open",
  },
  {
    kind: "commit",
    icon: "GitCommit",
    color: palette.purple,
    ref: "a3f9c21",
    title: "fix: keyboard nav for grouped options",
    context: "committed to master",
    badge: "verified",
  },
  {
    kind: "rfc",
    icon: "FileText",
    color: palette.blue,
    ref: "RFC-014",
    title: "Form primitives & controlled inputs",
    context: "design-system · draft",
    badge: "Review",
  },
  {
    kind: "slack",
    icon: "MessageSquare",
    color: palette.amber,
    ref: "#eng-design-system",
    title: "why not just use native <select>?",
    context: "12 replies · 4 people",
    badge: "Thread",
  },
  {
    kind: "doc",
    icon: "FileCode2",
    color: palette.slate,
    ref: "DOC",
    title: "Dropdown — Architecture Decision Record",
    context: "confluence · last edited May",
    badge: "ADR",
  },
];

/** Convert a hex color to an rgba() string. */
export function rgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Deterministic pseudo-random generator so scenes replay identically. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
