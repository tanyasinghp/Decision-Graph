"use client";

/**
 * KeynoteText — Apple-keynote-style typographic reveal.
 *
 * Big, tightly-tracked type that fades up with a soft blur-in and settles on
 * a slow ease-out curve. Used for every headline across the six scenes so the
 * words always feel like they belong to the same film.
 */

import { motion } from "framer-motion";
import { easeKeynote, palette, timing } from "./tokens";

export interface KeynoteTextProps {
  children: React.ReactNode;
  /** Seconds before the reveal begins. */
  delay?: number;
  /** Visual scale of the headline. */
  size?: "sm" | "md" | "lg" | "xl";
  /** Muted tone for secondary lines. */
  tone?: "primary" | "dim" | "accent";
  weight?: number;
  /** If provided, component fades out this long after appearing. */
  exitAfter?: number;
  className?: string;
}

const SIZES: Record<NonNullable<KeynoteTextProps["size"]>, string> = {
  sm: "clamp(1.4rem, 3vw, 2.2rem)",
  md: "clamp(2rem, 4.5vw, 3.4rem)",
  lg: "clamp(2.8rem, 6vw, 5rem)",
  xl: "clamp(3.6rem, 8vw, 7rem)",
};

const TONES: Record<NonNullable<KeynoteTextProps["tone"]>, string> = {
  primary: palette.ink,
  dim: palette.inkDim,
  accent: palette.amber,
};

export default function KeynoteText({
  children,
  delay = 0,
  size = "lg",
  tone = "primary",
  weight = 600,
  exitAfter,
  className = "",
}: KeynoteTextProps) {
  const animate = exitAfter
    ? {
        opacity: [0, 1, 1, 0],
        y: [18, 0, 0, -10],
        filter: ["blur(10px)", "blur(0px)", "blur(0px)", "blur(6px)"],
      }
    : { opacity: 1, y: 0, filter: "blur(0px)" };

  const transition = exitAfter
    ? {
        duration: timing.textIn + exitAfter + timing.textOut,
        times: [
          0,
          timing.textIn / (timing.textIn + exitAfter + timing.textOut),
          (timing.textIn + exitAfter) /
            (timing.textIn + exitAfter + timing.textOut),
          1,
        ],
        delay,
        ease: easeKeynote,
      }
    : { duration: timing.textIn, delay, ease: easeKeynote };

  return (
    <motion.div
      initial={{ opacity: 0, y: 18, filter: "blur(10px)" }}
      animate={animate}
      transition={transition}
      className={className}
      style={{
        fontSize: SIZES[size],
        fontWeight: weight,
        letterSpacing: "-0.03em",
        lineHeight: 1.05,
        color: TONES[tone],
        textAlign: "center",
        textWrap: "balance" as never,
      }}
    >
      {children}
    </motion.div>
  );
}
