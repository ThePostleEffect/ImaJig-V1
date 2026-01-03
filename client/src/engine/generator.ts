import { PuzzleConfig, GameState, Piece } from './types';
import { classicGrid } from '../cuts/classicGrid';

import { pixelRetro } from '../cuts/pixelRetro';
import { randomShapes } from '../cuts/randomShapes';

export class PuzzleGenerator {
  async generate(config: PuzzleConfig): Promise<GameState> {
    let pieces: Piece[] = [];

    switch (config.cutStyle) {
      case 'classic':
        pieces = await classicGrid.generate(config);
        break;

      case 'retro':
        pieces = await pixelRetro.generate(config);
        break;
      case 'shapes':
        pieces = await randomShapes.generate(config);
        break;
      default:
        pieces = await classicGrid.generate(config);
    }

    // Convert array to map
    const piecesMap: Record<string, Piece> = {};
    pieces.forEach(p => {
      piecesMap[p.id] = p;
    });

    return {
      pieces: piecesMap,
      groups: {}, // Initialize empty groups map
      boardSize: { width: config.image.width * 1.5, height: config.image.height * 1.5 },
      scale: 1,
      pan: { x: 0, y: 0 },
      moveCount: 0,
      elapsedTime: 0,
      startTime: Date.now(),
      isComplete: false
    };
  }
}
