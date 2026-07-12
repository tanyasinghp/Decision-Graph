/**
 * validation/GroundTruth.ts — loads and segments held-out decision docs.
 *
 * DECISION: segmentation is DETERMINISTIC (markdown heading split), not
 * LLM-based. The ground-truth side of the benchmark must be a fixed target:
 * if the judge model changes, the units being scored against must not.
 * Razorpay's _decisions docs are heading-structured; each ## section that
 * carries substance becomes one scorable unit.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface GroundTruthUnit {
  /** Stable reference: <file>#<heading-slug> — used in reports and judging. */
  ref: string;
  file: string;
  heading: string;
  body: string;
}

const MIN_BODY_CHARS = 80; // headings with no substance aren't decisions

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : p.endsWith(".md") ? [p] : [];
  });
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function segmentMarkdown(file: string, content: string): GroundTruthUnit[] {
  // Split on h2/h3 headings; the preamble before the first heading is a unit
  // too if substantial (some docs state the main decision up top).
  const parts = content.split(/^(?=#{2,3}\s)/m);
  const units: GroundTruthUnit[] = [];
  for (const part of parts) {
    const headingMatch = part.match(/^#{2,3}\s+(.+)/);
    const heading = headingMatch?.[1]?.trim() ?? "(preamble)";
    const body = part.replace(/^#{2,3}\s+.+\n?/, "").trim();
    if (body.length < MIN_BODY_CHARS) continue;
    units.push({ ref: `${file}#${slug(heading)}`, file, heading, body });
  }
  return units;
}

export class GroundTruth {
  constructor(private readonly rootDir: string, repo: string) {
    this.repoDir = path.join(rootDir, repo.replace("/", "__"));
  }
  private readonly repoDir: string;

  /** Units for one component: files whose path contains /<Component>/ (case-insensitive). */
  forComponent(component: string): GroundTruthUnit[] {
    const needle = `/${component.toLowerCase()}/`;
    return walk(this.repoDir)
      .filter((f) => f.toLowerCase().includes(needle))
      .flatMap((f) => segmentMarkdown(path.relative(this.repoDir, f), fs.readFileSync(f, "utf8")));
  }

  componentsAvailable(): string[] {
    // .../packages/blade/src/components/<Component>/_decisions/*.md
    const set = new Set<string>();
    for (const f of walk(this.repoDir)) {
      const m = f.match(/components\/([^/]+)\/_decisions\//i);
      if (m?.[1]) set.add(m[1]);
    }
    return [...set].sort();
  }
}
