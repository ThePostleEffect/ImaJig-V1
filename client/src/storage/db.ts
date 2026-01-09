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

export interface AppSettings {
  id?: number;
  key: string;
  value: string;
}

class ImaJigDB extends Dexie {
  puzzles!: Table<SavedPuzzle, number>;
  settings!: Table<AppSettings, number>;

  constructor() {
    super('ImaJigDB');
    this.version(1).stores({
      puzzles: '++id, name, createdAt, updatedAt',
    });
    
    // Add settings table in version 2
    this.version(2).stores({
      puzzles: '++id, name, createdAt, updatedAt',
      settings: '++id, key, value',
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

  const puzzleId = await db.puzzles.put(puzzle);
  
  // Update last puzzle ID setting
  await setSetting('lastPuzzleId', puzzleId.toString());
  
  return puzzleId;
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

// App Settings helpers
export async function getSetting(key: string): Promise<string | null> {
  try {
    const setting = await db.settings.where('key').equals(key).first();
    return setting?.value || null;
  } catch (error) {
    console.warn('Failed to get setting:', error);
    return null;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  try {
    const existing = await db.settings.where('key').equals(key).first();
    if (existing) {
      await db.settings.update(existing.id!, { value });
    } else {
      await db.settings.add({ key, value });
    }
  } catch (error) {
    console.warn('Failed to set setting:', error);
  }
}

// Helper functions for puzzle management
export async function getLastPuzzle(): Promise<SavedPuzzle | null> {
  try {
    const lastPuzzleId = await getSetting('lastPuzzleId');
    if (!lastPuzzleId) return null;
    
    const puzzle = await db.puzzles.get(parseInt(lastPuzzleId));
    return puzzle || null;
  } catch (error) {
    console.warn('Failed to get last puzzle:', error);
    return null;
  }
}

export function calculateProgress(puzzle: SavedPuzzle): number {
  if (puzzle.gameState.isComplete) return 100;
  
  const totalPieces = puzzle.serializedConfig.rows * puzzle.serializedConfig.cols;
  const lockedPieces = Object.values(puzzle.gameState.pieces).filter(p => p.isLocked).length;
  
  return Math.round((lockedPieces / totalPieces) * 100);
}

export function formatLastPlayed(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return new Date(timestamp).toLocaleDateString();
}
