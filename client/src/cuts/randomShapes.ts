import { Piece, PuzzleConfig, Point, Neighbor } from '../engine/types';
import { CutGenerator, generateSeed } from './types';

// --- Types & Constants ---
interface CanonicalEdge {
  points: Point[]; // Points from (0,0) to (length, 0)
  sign: number;    // 1 = Tab Out (Positive Y), -1 = Tab In (Negative Y)
}

export const randomShapes: CutGenerator = {
  generate: async (config: PuzzleConfig) => {
    const { image, rows, cols, seed } = config;
    const pieces: Piece[] = [];
    
    const pieceWidth = image.width / cols;
    const pieceHeight = image.height / rows;
    const baseSize = Math.min(pieceWidth, pieceHeight);
    const tabSize = baseSize * 0.3; 

    // 1. Generate Canonical Edges
    const vEdges: CanonicalEdge[][] = []; // [r][c]
    const hEdges: CanonicalEdge[][] = []; // [r][c]

    // Generate Vertical Edges
    for (let r = 0; r < rows; r++) {
      vEdges[r] = [];
      for (let c = 0; c < cols - 1; c++) {
        const edgeSeed = r * cols + c + seed + 20000;
        vEdges[r][c] = generateBeveledEdgePolyline(pieceHeight, tabSize, edgeSeed);
      }
    }

    // Generate Horizontal Edges
    for (let r = 0; r < rows - 1; r++) {
      hEdges[r] = [];
      for (let c = 0; c < cols; c++) {
        const edgeSeed = r * cols + c + seed + 30000;
        hEdges[r][c] = generateBeveledEdgePolyline(pieceWidth, tabSize, edgeSeed);
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

function generateBeveledEdgePolyline(length: number, tabSize: number, seed: number): CanonicalEdge {
  const rng = generateSeed(seed);
  const points: Point[] = [];
  
  // Randomly decide Tab Out (1) or In (-1)
  const sign = rng() > 0.5 ? 1 : -1;
  
  const p = (x: number, y: number) => ({ x, y: y * sign });
  
  points.push(p(0, 0));
  
  // Choose a style for this edge
  const style = Math.floor(rng() * 4);
  
  // Bevel parameters
  // Limit bevel length to 8-22% of side length as requested
  const bevelLen = length * (0.08 + rng() * 0.14); 
  const depth = tabSize * (0.5 + rng() * 0.5);
  
  if (style === 0) {
    // Single Triangle Tab (Pyramid)
    const mid = length / 2 + (rng() - 0.5) * length * 0.2;
    points.push(p(mid - bevelLen, 0));
    points.push(p(mid, depth));
    points.push(p(mid + bevelLen, 0));
  } else if (style === 1) {
    // Trapezoid Tab
    const mid = length / 2 + (rng() - 0.5) * length * 0.2;
    const topWidth = bevelLen * 0.8;
    points.push(p(mid - bevelLen, 0));
    points.push(p(mid - topWidth, depth));
    points.push(p(mid + topWidth, depth));
    points.push(p(mid + bevelLen, 0));
  } else if (style === 2) {
    // Slanted Edge (Parallelogram effect)
    // Just one kink
    const k1 = length * 0.3;
    const k2 = length * 0.7;
    const shift = depth * 0.5;
    points.push(p(k1, shift));
    points.push(p(k2, shift));
  } else {
    // Zig-Zag (Lightning)
    const mid = length / 2;
    points.push(p(mid - bevelLen, 0));
    points.push(p(mid - bevelLen/2, -depth/2)); // Dip in
    points.push(p(mid, 0));
    points.push(p(mid + bevelLen/2, depth/2)); // Dip out
    points.push(p(mid + bevelLen, 0));
  }
  
  points.push(p(length, 0));
  
  return { points, sign };
}
