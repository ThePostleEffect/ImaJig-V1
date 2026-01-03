import { Piece, Rect } from './types';

export class SpatialHash {
  private cellSize: number;
  private buckets: Map<string, string[]>;

  constructor(cellSize: number) {
    this.cellSize = cellSize;
    this.buckets = new Map();
  }

  private getKey(x: number, y: number): string {
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);
    return `${cellX},${cellY}`;
  }

  private getKeysForRect(rect: Rect): string[] {
    const keys: string[] = [];
    const startX = Math.floor(rect.x / this.cellSize);
    const startY = Math.floor(rect.y / this.cellSize);
    const endX = Math.floor((rect.x + rect.width) / this.cellSize);
    const endY = Math.floor((rect.y + rect.height) / this.cellSize);

    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        keys.push(`${x},${y}`);
      }
    }
    return keys;
  }

  clear() {
    this.buckets.clear();
  }

  insert(piece: Piece) {
    // Calculate bounding box of the piece in its current pose
    // For simplicity, we'll use a rough bounding box based on centroid and a fixed size
    // In a real implementation, we'd compute the AABB of the rotated polygon
    const size = 100; // Approximate max piece size
    const rect: Rect = {
      x: piece.currentPose.x - size / 2,
      y: piece.currentPose.y - size / 2,
      width: size,
      height: size,
    };

    const keys = this.getKeysForRect(rect);
    keys.forEach((key) => {
      if (!this.buckets.has(key)) {
        this.buckets.set(key, []);
      }
      this.buckets.get(key)!.push(piece.id);
    });
  }

  query(rect: Rect): string[] {
    const keys = this.getKeysForRect(rect);
    const result = new Set<string>();

    keys.forEach((key) => {
      const bucket = this.buckets.get(key);
      if (bucket) {
        bucket.forEach((id) => result.add(id));
      }
    });

    return Array.from(result);
  }
}
