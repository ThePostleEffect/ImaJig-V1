import { describe, it, expect } from "vitest";

// NOTE: adjust these imports to match your codebase
import { generatePuzzle } from "./generator"; // or wherever your generator entry is
import type { CutStyle } from "../cuts/types"; // adjust if needed

const styles: CutStyle[] = ["classic", "retro", "shapes"];

describe("Puzzle generator smoke", () => {
  it("generates sane pieces for each style", async () => {
    for (const style of styles) {
      const puzzle = await generatePuzzle({
        // keep this minimal; adjust keys to your generator config
        style,
        cols: 3,
        rows: 2,
        seed: 1234,
        // if your generator needs an image, use a tiny stub canvas/image if supported
      } as any);

      expect(puzzle).toBeTruthy();
      expect(puzzle.pieces?.length).toBe(6);

      for (const p of puzzle.pieces) {
        expect(p.id).toBeDefined();
        expect(Number.isFinite(p.correctPose?.x ?? p.correctX)).toBe(true);
        expect(Number.isFinite(p.correctPose?.y ?? p.correctY)).toBe(true);
        expect(p.path || p.outline || p.polygon).toBeTruthy();
      }
    }
  });
});
