"use client";

/**
 * CinematicStage — the shared frame every scene sits inside.
 *
 * Full-screen, deep-black, fixed. Provides consistent cinematic lighting
 * (a soft top key-light + vignette) so all six scenes share the same
 * "room". Scenes are self-contained and refresh-replayable; pressing "R"
 * reloads for a clean re-take without showing any UI chrome on camera.
 */

import { useEffect, type ReactNode } from "react";
import { STAGE_BG } from "./tokens";

interface CinematicStageProps {
  children: ReactNode;
  /** Optional very-subtle color wash for the key light. Defaults to neutral. */
  glow?: string;
  /** Show thin letterbox bars top & bottom for a filmic frame. */
  letterbox?: boolean;
}

export default function CinematicStage({
  children,
  glow = "rgba(120,120,140,0.10)",
  letterbox = false,
}: CinematicStageProps) {
  // Press "R" to reload for a clean re-take (never shown on screen).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "r" || e.key === "R") window.location.reload();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main
      className="fixed inset-0 overflow-hidden select-none"
      style={{
        background: STAGE_BG,
        fontFamily: "var(--font-inter), system-ui, sans-serif",
      }}
    >
      {/* Soft top key-light */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(120% 80% at 50% -10%, ${glow} 0%, transparent 55%)`,
        }}
      />

      {/* Vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(130% 100% at 50% 50%, transparent 55%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      {/* Scene content */}
      <div className="absolute inset-0">{children}</div>

      {letterbox && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[6vh] bg-black" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[6vh] bg-black" />
        </>
      )}
    </main>
  );
}
