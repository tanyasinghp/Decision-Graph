/**
 * graph/export.ts — JSON / GraphML / Mermaid serializers.
 * Debugging aids and integration bridges; deliberately dependency-free.
 */

import type { GraphStore } from "./GraphStore.js";

const xml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function toJson(store: GraphStore): string {
  return JSON.stringify({ nodes: store.nodes(), edges: store.edges() }, null, 2);
}

export function toGraphML(store: GraphStore): string {
  const L: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<graphml xmlns="http://graphml.graphdrawing.org/xmlns">`,
    `  <key id="type" for="node" attr.name="type" attr.type="string"/>`,
    `  <key id="label" for="node" attr.name="label" attr.type="string"/>`,
    `  <key id="confidence" for="node" attr.name="confidence" attr.type="string"/>`,
    `  <key id="etype" for="edge" attr.name="type" attr.type="string"/>`,
    `  <graph id="decision-graph" edgedefault="directed">`,
  ];
  for (const n of store.nodes()) {
    L.push(`    <node id="${xml(n.id)}">`);
    L.push(`      <data key="type">${xml(n.type)}</data>`);
    L.push(`      <data key="label">${xml(n.label)}</data>`);
    L.push(`      <data key="confidence">${xml(n.confidence ?? "n/a")}</data>`);
    L.push(`    </node>`);
  }
  for (const e of store.edges()) {
    L.push(`    <edge source="${xml(e.from)}" target="${xml(e.to)}"><data key="etype">${xml(e.type)}</data></edge>`);
  }
  L.push(`  </graph>`, `</graphml>`);
  return L.join("\n") + "\n";
}

export function toMermaid(store: GraphStore): string {
  // Mermaid ids must be alphanumeric — index nodes, keep labels readable.
  const ids = new Map(store.nodes().map((n, i) => [n.id, `n${i}`]));
  const shape = (type: string, label: string): [string, string] => {
    const l = label.length > 40 ? label.slice(0, 37) + "..." : label;
    switch (type) {
      case "decision": return ["([", "])"];       // stadium
      case "component": return ["[[", "]]"];      // subroutine
      case "actor": return ["((", "))"];          // circle
      default: return ["[", "]"];                 // rect
    }
  };
  const L = ["flowchart LR"];
  for (const n of store.nodes()) {
    const [o, c] = shape(n.type, n.label);
    L.push(`  ${ids.get(n.id)}${o}"${n.label.replace(/"/g, "'").slice(0, 40)}"${c}`);
  }
  for (const e of store.edges()) {
    L.push(`  ${ids.get(e.from)} -->|${e.type}| ${ids.get(e.to)}`);
  }
  return L.join("\n") + "\n";
}
