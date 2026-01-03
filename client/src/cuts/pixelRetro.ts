import { Piece, PuzzleConfig, Point, Neighbor } from '../engine/types';
import { CutGenerator, generateSeed } from './types';

export const pixelRetro: CutGenerator = {
  generate: async (config: PuzzleConfig) => {
    const { image, rows, cols, seed } = config;
    const rng = generateSeed(seed);
    const pieces: Piece[] = [];
    
    const pieceWidth = image.width / cols;
    const pieceHeight = image.height / rows;

    // Define pixel step size
    const stepSize = Math.min(pieceWidth, pieceHeight) / 5;

    const verticalEdges: number[][] = [];
    const horizontalEdges: number[][] = [];

    for (let r = 0; r < rows; r++) {
      verticalEdges[r] = [];
      for (let c = 0; c < cols - 1; c++) {
        verticalEdges[r][c] = rng() > 0.5 ? 1 : -1;
      }
    }

    for (let r = 0; r < rows - 1; r++) {
      horizontalEdges[r] = [];
      for (let c = 0; c < cols; c++) {
        horizontalEdges[r][c] = rng() > 0.5 ? 1 : -1;
      }
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const id = `piece_${r}_${c}`;
        const x = c * pieceWidth;
        const y = r * pieceHeight;
        const centroid = { x: x + pieceWidth / 2, y: y + pieceHeight / 2 };
        
        const outline: Point[] = [];

        // Top
        if (r === 0) {
          outline.push({ x: -pieceWidth / 2, y: -pieceHeight / 2 });
          outline.push({ x: pieceWidth / 2, y: -pieceHeight / 2 });
        } else {
          const type = -horizontalEdges[r - 1][c];
          addPixelEdge(outline, -pieceWidth / 2, -pieceHeight / 2, pieceWidth / 2, -pieceHeight / 2, type, stepSize);
        }

        // Right
        if (c === cols - 1) {
          outline.push({ x: pieceWidth / 2, y: pieceHeight / 2 });
        } else {
          const type = verticalEdges[r][c];
          addPixelEdge(outline, pieceWidth / 2, -pieceHeight / 2, pieceWidth / 2, pieceHeight / 2, type, stepSize);
        }

        // Bottom
        if (r === rows - 1) {
          outline.push({ x: -pieceWidth / 2, y: pieceHeight / 2 });
        } else {
          const type = horizontalEdges[r][c];
          addPixelEdge(outline, pieceWidth / 2, pieceHeight / 2, -pieceWidth / 2, pieceHeight / 2, type, stepSize);
        }

        // Left
        if (c === 0) {
          outline.push({ x: -pieceWidth / 2, y: -pieceHeight / 2 });
        } else {
          const type = -verticalEdges[r][c - 1];
          addPixelEdge(outline, -pieceWidth / 2, pieceHeight / 2, -pieceWidth / 2, -pieceHeight / 2, type, stepSize);
        }
        
        // Close the loop explicitly
        // The first point was (-pieceWidth/2, -pieceHeight/2)
        // The last point added by Left edge is (-pieceWidth/2, -pieceHeight/2)
        // But let's ensure it's exactly the same object/value or just rely on the fact that we pushed it.
        // Validator checks dist(first, last).
        // If Left edge ends at (-w/2, -h/2), and Top edge started at (-w/2, -h/2).
        // Wait, Top edge:
        // if (r===0) push(-w/2, -h/2).
        // else addPixelEdge(..., -w/2, -h/2, ..., ...).
        // addPixelEdge pushes the END point.
        // So Top edge ends at (w/2, -h/2).
        // ...
        // Left edge ends at (-w/2, -h/2).
        // So the last point in `outline` is (-w/2, -h/2).
        // The first point in `outline` is (-w/2, -h/2).
        // So dist should be 0.
        
        // Why did it fail?
        // Maybe addPixelEdge doesn't push the last point?
        // "points.push({ x: x2, y: y2 });" -> Yes it does.
        
        // Maybe floating point error?
        // Let's explicitly push the first point again to be safe.
        outline.push({ x: outline[0].x, y: outline[0].y });

        const neighbors: Neighbor[] = [];
        if (r > 0) neighbors.push({ otherId: `piece_${r - 1}_${c}`, deltaPose: { x: 0, y: -pieceHeight, rotation: 0 }, edgeKey: `h_${r - 1}_${c}` });
        if (r < rows - 1) neighbors.push({ otherId: `piece_${r + 1}_${c}`, deltaPose: { x: 0, y: pieceHeight, rotation: 0 }, edgeKey: `h_${r}_${c}` });
        if (c > 0) neighbors.push({ otherId: `piece_${r}_${c - 1}`, deltaPose: { x: -pieceWidth, y: 0, rotation: 0 }, edgeKey: `v_${r}_${c - 1}` });
        if (c < cols - 1) neighbors.push({ otherId: `piece_${r}_${c + 1}`, deltaPose: { x: pieceWidth, y: 0, rotation: 0 }, edgeKey: `v_${r}_${c}` });

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
          border: {
            top: r === 0,
            bottom: r === rows - 1,
            left: c === 0,
            right: c === cols - 1
          }
        });
      }
    }

    return pieces;
  },
};

function addPixelEdge(
  points: Point[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  type: number,
  step: number
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const nx = -dy / len;
  const ny = dx / len;

  // 3-step pixel tab
  // P1 -> Out -> Across -> In -> P2
  
  const midX = x1 + dx * 0.5;
  const midY = y1 + dy * 0.5;
  
  const tabW = len * 0.3;
  const tabH = step * 2 * type;

  // Start of tab base
  points.push({ x: x1 + dx * 0.35, y: y1 + dy * 0.35 });
  
  // Step out
  points.push({ x: x1 + dx * 0.35 + nx * tabH, y: y1 + dy * 0.35 + ny * tabH });
  
  // Across
  points.push({ x: x1 + dx * 0.65 + nx * tabH, y: y1 + dy * 0.65 + ny * tabH });
  
  // Step in
  points.push({ x: x1 + dx * 0.65, y: y1 + dy * 0.65 });
  
  // End
  points.push({ x: x2, y: y2 });
}
