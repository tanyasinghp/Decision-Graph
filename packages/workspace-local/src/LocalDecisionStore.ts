/**
 * LocalDecisionStore — decisions as data/decisions/<component>.<prompt>.json,
 * matching what build-graph/evaluate already read. Formats unchanged.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { DecisionObjectSchema } from "@dg/domain/schemas.js";
import type { DecisionObject } from "@dg/domain/types.js";
import type { DecisionStore } from "@dg/core";

const Decisions = z.array(DecisionObjectSchema);

export class LocalDecisionStore implements DecisionStore {
  constructor(private readonly dir: string) {}

  save(component: string, promptVersion: string, decisions: DecisionObject[]): void {
    fs.mkdirSync(this.dir, { recursive: true });
    const file = path.join(this.dir, `${component.toLowerCase()}.${promptVersion}.json`);
    fs.writeFileSync(file, JSON.stringify(decisions, null, 2) + "\n", "utf8");
  }

  loadComponent(component: string, promptVersion: string): DecisionObject[] {
    const file = path.join(this.dir, `${component.toLowerCase()}.${promptVersion}.json`);
    if (!fs.existsSync(file)) return [];
    return Decisions.parse(JSON.parse(fs.readFileSync(file, "utf8")));
  }

  loadAll(promptVersion: string): DecisionObject[] {
    if (!fs.existsSync(this.dir)) return [];
    return fs
      .readdirSync(this.dir)
      .filter((f) => f.endsWith(`.${promptVersion}.json`))
      .flatMap((f) => Decisions.parse(JSON.parse(fs.readFileSync(path.join(this.dir, f), "utf8"))));
  }
}
