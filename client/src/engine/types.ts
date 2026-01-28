export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Pose {
  x: number;
  y: number;
  rotation: number; // in radians
}

export interface Neighbor {
  otherId: string;
  deltaPose: Pose; // Expected relative pose of otherId relative to this piece
  edgeKey: string; // Unique identifier for the shared edge
}

export interface Piece {
  id: string;
  outline: Point[]; // Polygon points relative to centroid (0,0)
  centroid: Point; // Original position in the complete image
  correctPose: Pose; // The "solved" pose
  currentPose: Pose; // Current pose on the board
  neighbors: Neighbor[];
  groupId: string; // ID of the connected cluster this piece belongs to
  zIndex: number;
  isLocked: boolean; // True if part of a completed group or locked in place
  inTray?: boolean; // True if the piece is stored in the bottom tray
  border?: { top: boolean; right: boolean; bottom: boolean; left: boolean; };
}

export interface PuzzleConfig {
  image: HTMLImageElement;
  rows: number;
  cols: number;
  cutStyle: 'classic' | 'retro' | 'shapes';
  seed: number;
  rotationEnabled: boolean;
}

export interface GameState {
  pieces: Record<string, Piece>;
  groups: Record<string, string[]>; // groupId -> list of pieceIds
  boardSize: Size;
  scale: number;
  pan: Point;
  isComplete: boolean;
  startTime: number;
  elapsedTime: number;
  moveCount: number;
}
