"use client";

import { useEffect, useRef } from "react";
import { useReactFlow } from "reactflow";
import { useDemoContext } from "@/lib/demo-context";

/**
 * Subscribes to the centralized cameraTarget from context and smoothly
 * moves the ReactFlow viewport.  All camera choreography lives here —
 * no other component manages zoom or pan.
 */
export function useGraphController() {
  const { state } = useDemoContext();
  const { cameraTarget, graph } = state;
  const { getNodes, setCenter, fitView } = useReactFlow();
  const focusedRef = useRef<string | null>(null);

  // Initial fit on graph load
  const hasFit = useRef(false);
  useEffect(() => {
    if (graph && !hasFit.current) {
      const nodes = getNodes();
      if (nodes.length > 0) {
        requestAnimationFrame(() => {
          fitView({ padding: 0.25, duration: 400 });
        });
        hasFit.current = true;
      }
    }
  }, [graph, getNodes, fitView]);

  // Camera follows the active node
  useEffect(() => {
    if (!cameraTarget) {
      // Zoom back out when camera target clears
      if (focusedRef.current) {
        fitView({ padding: 0.25, duration: 800 });
        focusedRef.current = null;
      }
      return;
    }

    const { nodeId, zoom = 1.5 } = cameraTarget;
    const nodes = getNodes();
    const target = nodes.find((n) => n.id === nodeId);

    if (target) {
      const x = target.position.x + ((target.width as number) ?? 200) / 2;
      const y = target.position.y + ((target.height as number) ?? 80) / 2;
      setCenter(x, y, { zoom, duration: 600 });
      focusedRef.current = nodeId;
    }
  }, [cameraTarget, getNodes, setCenter, fitView]);
}
