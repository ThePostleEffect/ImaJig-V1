import { Piece, PuzzleConfig, Point, Neighbor } from '../engine/types';
import { CutGenerator, generateSeed } from './types';

// --- Types & Constants ---
const SAMPLES_PER_EDGE = 40; 

interface CanonicalEdge {
  points: Point[]; // Points from (0,0) to (length, 0)
  sign: number;    // 1 = Tab Out (Positive Y), -1 = Tab In (Negative Y)
}

export const classicGrid: CutGenerator = {
  generate: async (config: PuzzleConfig) => {
    const { image, rows, cols, seed } = config;
    const pieces: Piece[] = [];
    
    const pieceWidth = image.width / cols;
    const pieceHeight = image.height / rows;
    const baseSize = Math.min(pieceWidth, pieceHeight);
    
    // Configurable parameters for the "Classic" look
    const tabSize = baseSize * 0.25; 

    // 1. Generate Canonical Edges
    const vEdges: CanonicalEdge[][] = []; // [r][c]
    const hEdges: CanonicalEdge[][] = []; // [r][c]

    // Generate Vertical Edges
    for (let r = 0; r < rows; r++) {
      vEdges[r] = [];
      for (let c = 0; c < cols - 1; c++) {
        const edgeSeed = r * cols + c + seed + 10000;
        vEdges[r][c] = generateClassicEdgePolyline(pieceHeight, tabSize, edgeSeed);
      }
    }

    // Generate Horizontal Edges
    for (let r = 0; r < rows - 1; r++) {
      hEdges[r] = [];
      for (let c = 0; c < cols; c++) {
        const edgeSeed = r * cols + c + seed;
        hEdges[r][c] = generateClassicEdgePolyline(pieceWidth, tabSize, edgeSeed);
      }
    }

    // 2. Assemble Pieces
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const id = `piece_${r}_${c}`;
        const x = c * pieceWidth;
        const y = r * pieceHeight;
        const centroid = { x: x + pieceWidth / 2, y: y + pieceHeight / 2 };
        
        const outline: Point[] = [];
        
        // --- TOP EDGE ---
        // Left -> Right
        if (r === 0) {
          outline.push({ x: -pieceWidth/2, y: -pieceHeight/2 });
          outline.push({ x: pieceWidth/2, y: -pieceHeight/2 });
        } else {
          const topEdge = hEdges[r-1][c];
          // Canonical: 0->L. +y is Up.
          // Map: x = -w/2 + p.x, y = -h/2 - p.y
          for (let i = 0; i < topEdge.points.length; i++) {
            outline.push({
              x: -pieceWidth/2 + topEdge.points[i].x,
              y: -pieceHeight/2 - topEdge.points[i].y
            });
          }
        }

        // --- RIGHT EDGE ---
        // Top -> Bottom
        if (c === cols - 1) {
          outline.push({ x: pieceWidth/2, y: pieceHeight/2 });
        } else {
          const edge = vEdges[r][c];
          // Canonical: 0->L. +y is Left (Right in screen).
          // Map: x = w/2 + p.y, y = -h/2 + p.x
          for (let i = 0; i < edge.points.length; i++) {
            outline.push({
              x: pieceWidth/2 + edge.points[i].y,
              y: -pieceHeight/2 + edge.points[i].x
            });
          }
        }

        // --- BOTTOM EDGE ---
        // Right -> Left
        if (r === rows - 1) {
          outline.push({ x: -pieceWidth/2, y: pieceHeight/2 });
        } else {
          const bottomEdge = hEdges[r][c];
          // Canonical: 0->L. +y is Up.
          // Iterate BACKWARDS to traverse Right -> Left
          // x = -w/2 + p.x (Maps L->0 to -w/2, L->L to w/2. So Backwards L->0 maps w/2 -> -w/2)
          // y = h/2 - p.y (Matches neighbor's -h/2 - p.y)
          for (let i = bottomEdge.points.length - 1; i >= 0; i--) {
            outline.push({
              x: -pieceWidth/2 + bottomEdge.points[i].x,
              y: pieceHeight/2 - bottomEdge.points[i].y
            });
          }
        }

        // --- LEFT EDGE ---
        // Bottom -> Top
        if (c === 0) {
          outline.push({ x: -pieceWidth/2, y: -pieceHeight/2 });
        } else {
          const leftEdge = vEdges[r][c-1];
          // Canonical: 0->L. +y is Left (Right in screen).
          // Iterate BACKWARDS to traverse Bottom -> Top
          // x = -w/2 + p.y (Matches neighbor's w/2 + p.y)
          // y = -pieceHeight/2 + p.x (Maps L->0 to -h/2, L->L to h/2. So Backwards L->0 maps h/2 -> -h/2)
          for (let i = leftEdge.points.length - 1; i >= 0; i--) {
            outline.push({
              x: -pieceWidth/2 + leftEdge.points[i].y,
              y: -pieceHeight/2 + leftEdge.points[i].x
            });
          }
        }

        // Neighbors
        const neighbors: Neighbor[] = [];
        if (r > 0) neighbors.push({ otherId: `piece_${r - 1}_${c}`, deltaPose: { x: 0, y: -pieceHeight, rotation: 0 }, edgeKey: `h_${r - 1}_${c}` });
        if (r < rows - 1) neighbors.push({ otherId: `piece_${r + 1}_${c}`, deltaPose: { x: 0, y: pieceHeight, rotation: 0 }, edgeKey: `h_${r}_${c}` });
        if (c > 0) neighbors.push({ otherId: `piece_${r}_${c - 1}`, deltaPose: { x: -pieceWidth, y: 0, rotation: 0 }, edgeKey: `v_${r}_${c - 1}` });
        if (c < cols - 1) neighbors.push({ otherId: `piece_${r}_${c + 1}`, deltaPose: { x: pieceWidth, y: 0, rotation: 0 }, edgeKey: `v_${r}_${c}` });

        // Border Metadata
        const border = {
          top: r === 0,
          bottom: r === rows - 1,
          left: c === 0,
          right: c === cols - 1
        };

        pieces.push({
          id,
          outline,
          centroid,
          correctPose: { x: centroid.x, y: centroid.y, rotation: 0 },
          currentPose: { x: centroid.x, y: centroid.y, rotation: 0 },
          neighbors,
          groupId: id,
          zIndex: 0,
          isLocked: false,
          border
        });
      }
    }

    return pieces;
  },
};

function generateClassicEdgePolyline(length: number, tabSize: number, seed: number): CanonicalEdge {
  const rng = generateSeed(seed);
  const points: Point[] = [];
  
  // Randomly decide Tab Out (1) or In (-1)
  const sign = rng() > 0.5 ? 1 : -1;
  
  const p = (x: number, y: number) => ({ x, y: y * sign });
  
  // Classic Jigsaw Parameters
  const mid = length / 2;
  const jitter = (rng() - 0.5) * length * 0.05;
  const center = mid + jitter;
  
  const neckWidth = tabSize * 0.4;
  const headWidth = tabSize * 0.8;
  const height = tabSize;
  
  points.push(p(0, 0));
  
  // Shoulder Left
  const shoulderL = center - headWidth * 1.3;
  const shoulderR = center + headWidth * 1.3;
  
  points.push(p(shoulderL, 0));
  
  // Curve 1: Shoulder to Neck (Left)
  // Inward curve
  addBezier(points,
    p(shoulderL, 0),
    p(center - headWidth, 0),
    p(center - headWidth, height * 0.2),
    p(center - neckWidth * 0.6, height * 0.2)
  );
  
  // Curve 2: Neck to Head Side (Left)
  // Outward curve
  addBezier(points,
    p(center - neckWidth * 0.6, height * 0.2),
    p(center - neckWidth * 0.2, height * 0.2),
    p(center - headWidth * 0.6, height * 0.5),
    p(center - headWidth * 0.5, height * 0.6)
  );
  
  // Curve 3: Head Top (Left to Right)
  // Round top
  addBezier(points,
    p(center - headWidth * 0.5, height * 0.6),
    p(center - headWidth * 0.2, height * 1.1),
    p(center + headWidth * 0.2, height * 1.1),
    p(center + headWidth * 0.5, height * 0.6)
  );
  
  // Curve 4: Head Side to Neck (Right)
  addBezier(points,
    p(center + headWidth * 0.5, height * 0.6),
    p(center + headWidth * 0.6, height * 0.5),
    p(center + neckWidth * 0.2, height * 0.2),
    p(center + neckWidth * 0.6, height * 0.2)
  );
  
  // Curve 5: Neck to Shoulder (Right)
  addBezier(points,
    p(center + neckWidth * 0.6, height * 0.2),
    p(center + headWidth, height * 0.2),
    p(center + headWidth, 0),
    p(shoulderR, 0)
  );
  
  points.push(p(length, 0));
  
  return { points, sign };
}

function addBezier(points: Point[], p0: Point, p1: Point, p2: Point, p3: Point) {
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const tt = t * t;
    const uu = u * u;
    const uuu = uu * u;
    const ttt = tt * t;
    
    points.push({
      x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
      y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y
    });
  }
}
