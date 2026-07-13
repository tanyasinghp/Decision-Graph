"use client";

import { useEffect, useRef } from "react";
import { useReactFlow } from "reactflow";
import { useDemoContext } from "@/lib/demo-context";

/**
 * Camera choreography — Keynote, not Google Maps.
 *
 * Principles (UX_REDESIGN_PLAN §16):
 *  - The whole graph must stay recognizable at all times. We capture the
 *    baseline zoom right after the initial fitView and every subsequent
 *    focus move is a LEAN-IN: at most ~22% past baseline, never a dive.
 *  - Replay files may carry legacy zoom hints (the old 1.5 era). They are
 *    intentionally ignored — camera policy lives here, in one place.
 *  - Moves are slow (900ms) and eased; releases ease back to fit (800ms).
 */
export function useGraphController() {
  const { state } = useDemoContext();
  const { cameraTarget, graph } = state;
  const { getNodes, setCenter, fitView, getZoom } = useReactFlow();
  const focusedRef = useRef<string | null>(null);
  const baseZoomRef = useRef<number | null>(null);

  // Initial fit on graph load; capture baseline zoom once settled.
  const hasFit = useRef(false);
  useEffect(() => {
    if (graph && !hasFit.current) {
      const nodes = getNodes();
      if (nodes.length > 0) {
        requestAnimationFrame(() => {
          fitView({ padding: 0.15, duration: 400 });
          // Capture the "global context" zoom after the fit animation lands.
          window.setTimeout(() => {
            baseZoomRef.current = getZoom();
          }, 450);
        });
        hasFit.current = true;
      }
    }
  }, [graph, getNodes, fitView, getZoom]);

  // Camera leans toward the active node — subtle pan, slight zoom.
  useEffect(() => {
    if (!cameraTarget) {
      if (focusedRef.current) {
        fitView({ padding: 0.15, duration: 800 });
        focusedRef.current = null;
      }
      return;
    }

    const { nodeId } = cameraTarget; // zoom hint deliberately ignored (see docblock)
    const nodes = getNodes();
    const target = nodes.find((n) => n.id === nodeId);

    if (target) {
      const base = baseZoomRef.current ?? getZoom();
      // Lean-in ceiling: 18% past baseline (refinement §10: 15–20% max),
      // hard-capped, never below baseline. Pan does the work; zoom whispers.
      const zoom = Math.max(base, Math.min(base * 1.18, base + 0.22));
      const x = target.position.x + ((target.width as number) ?? 220) / 2;
      const y = target.position.y + ((target.height as number) ?? 80) / 2;
      setCenter(x, y, { zoom, duration: 900 });
      focusedRef.current = nodeId;
    }
  }, [cameraTarget, getNodes, setCenter, fitView, getZoom]);
}
