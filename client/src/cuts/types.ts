import { Piece, PuzzleConfig } from '../engine/types';

export interface CutGenerator {
  generate(config: PuzzleConfig): Promise<Piece[]>;
}

export function generateSeed(seed: number) {
  let value = seed;
  return function random() {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}
