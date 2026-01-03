import Dexie, { Table } from 'dexie';
import { GameState, Piece, PuzzleConfig } from '../engine/types';

export interface SavedPuzzle {
  id?: number;
  name: string;
  thumbnail: Blob; // Screenshot or small version of image
  createdAt: number;
  updatedAt: number;
  config?: PuzzleConfig; // Runtime only, not persisted
  // We need a serializable config.
  serializedConfig: {
    imageBlob: Blob;
    rows: number;
    cols: number;
    cutStyle: string;
    seed: number;
    rotationEnabled?: boolean;
  };
  gameState: {
    pieces: Record<string, any>; // Simplified piece state (currentPose, isLocked, groupId)
    groups: Record<string, string[]>;
    elapsedTime: number;
    moveCount: number;
    isComplete: boolean;
    pan: { x: number, y: number };
    zoom: number;
  };
}

class ImaJigDB extends Dexie {
  puzzles!: Table<SavedPuzzle, number>;

  constructor() {
    super('ImaJigDB');
    this.version(1).stores({
      puzzles: '++id, name, createdAt, updatedAt',
    });
  }
}

export const db = new ImaJigDB();

export async function savePuzzle(
  name: string,
  config: PuzzleConfig,
  gameState: GameState,
  thumbnail: Blob,
  existingId?: number
) {
  // Extract minimal state to save space
  const pieceState: Record<string, any> = {};
  Object.values(gameState.pieces).forEach(p => {
    pieceState[p.id] = {
      currentPose: p.currentPose,
      groupId: p.groupId,
      isLocked: p.isLocked,
      zIndex: p.zIndex
    };
  });

  // Convert image to blob if needed (it's already in memory, but we need to persist it)
  // We assume config.image is an HTMLImageElement. We need the source blob.
  // For now, let's fetch it again or assume we have it.
  // In a real app, we'd store the original blob.
  // Let's assume we pass the blob in config or separately.
  // For this prototype, we'll fetch the src to get a blob.
  
  const response = await fetch(config.image.src);
  const imageBlob = await response.blob();

  const puzzle: SavedPuzzle = {
    id: existingId,
    name,
    thumbnail,
    createdAt: existingId ? (await db.puzzles.get(existingId))?.createdAt || Date.now() : Date.now(),
    updatedAt: Date.now(),
    serializedConfig: {
      imageBlob,
      rows: config.rows,
      cols: config.cols,
      cutStyle: config.cutStyle,
      seed: config.seed,
      rotationEnabled: config.rotationEnabled
    },
    gameState: {
      pieces: pieceState,
      groups: gameState.groups,
      elapsedTime: gameState.elapsedTime,
      moveCount: gameState.moveCount,
      isComplete: gameState.isComplete,
      pan: gameState.pan,
      zoom: gameState.scale // Assuming scale is zoom
    }
  };

  return await db.puzzles.put(puzzle);
}

export async function loadPuzzle(id: number) {
  const saved = await db.puzzles.get(id);
  if (!saved) throw new Error('Puzzle not found');
  return saved;
}

export async function deletePuzzle(id: number) {
  return await db.puzzles.delete(id);
}

export async function listPuzzles() {
  return await db.puzzles.orderBy('updatedAt').reverse().toArray();
}
