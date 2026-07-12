/**
 * tests/guards.test.ts — THE test file. If these fail, the demo's central
 * claim ("Claude never saw the ground truth") is unsupportable.
 */

import { describe, expect, it } from "vitest";
import { isForbiddenPath, assertAllowedPath } from "../src/evidence/guards.js";
import { ForbiddenPathError } from "../src/domain/errors.js";

describe("isForbiddenPath", () => {
  it("blocks the canonical ground-truth path", () => {
    expect(isForbiddenPath("packages/blade/src/components/Alert/_decisions/decisions.md")).toBe(true);
  });

  it("blocks _decisions at any depth and as any segment", () => {
    expect(isForbiddenPath("_decisions/x.md")).toBe(true);
    expect(isForbiddenPath("a/b/c/_decisions")).toBe(true);
    expect(isForbiddenPath("a/_decisions/b/c.md")).toBe(true);
  });

  it("is case-insensitive and separator-insensitive", () => {
    expect(isForbiddenPath("packages/x/_DECISIONS/api.md")).toBe(true);
    expect(isForbiddenPath("packages\\x\\_decisions\\api.md")).toBe(true);
  });

  it("does NOT block lookalike names (segment match, not substring)", () => {
    expect(isForbiddenPath("docs/decisions-faq.md")).toBe(false);
    expect(isForbiddenPath("docs/my_decisions_notes.md")).toBe(false);
    expect(isForbiddenPath("rfcs/2022-04-09-accessibility.md")).toBe(false);
  });

  it("supports extra deny segments for future holdouts", () => {
    expect(isForbiddenPath("internal/adr/001.md", ["adr"])).toBe(true);
    expect(isForbiddenPath("internal/adr/001.md")).toBe(false);
  });
});

describe("assertAllowedPath", () => {
  it("throws recoverable ForbiddenPathError so the agent loop can continue", () => {
    try {
      assertAllowedPath("packages/x/_decisions/api.md");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenPathError);
      expect((e as ForbiddenPathError).recoverable).toBe(true);
    }
  });

  it("passes allowed paths silently", () => {
    expect(() => assertAllowedPath("rfcs/2023-01-01-tokens.md")).not.toThrow();
  });
});
