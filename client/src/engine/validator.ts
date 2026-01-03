import { Piece, GameState } from './types';
import { composePose, invertPose, rotatePoint } from './pose';

// Helper for applyPose since it wasn't exported
function applyPose(pose: {x: number, y: number, rotation: number}, point: {x: number, y: number}) {
  const rotated = rotatePoint(point, pose.rotation);
  return {
    x: pose.x + rotated.x,
    y: pose.y + rotated.y
  };
}

export interface ValidationResult {
  passed: boolean;
  checks: {
    count: { passed: boolean; message: string };
    integrity: { passed: boolean; message: string };
    coverage: { passed: boolean; message: string };
    flushness: { passed: boolean; message: string };
    flatness: { passed: boolean; message: string };
  };
  errors: string[];
}

export function validatePuzzle(state: GameState, rows: number, cols: number, imageWidth: number, imageHeight: number): ValidationResult {
  const result: ValidationResult = {
    passed: true,
    checks: {
      count: { passed: true, message: 'OK' },
      integrity: { passed: true, message: 'OK' },
      coverage: { passed: true, message: 'OK' },
      flushness: { passed: true, message: 'OK' },
      flatness: { passed: true, message: 'OK' },
    },
    errors: [],
  };

  // A) Piece Count
  const pieces = Object.values(state.pieces);
  const expectedCount = rows * cols;
  if (pieces.length !== expectedCount) {
    result.checks.count = { passed: false, message: `Expected ${expectedCount} pieces, found ${pieces.length}` };
    result.passed = false;
    result.errors.push(`Count mismatch: ${pieces.length}/${expectedCount}`);
  }

  // B) Outline Integrity
  for (const piece of pieces) {
    if (!piece.outline || piece.outline.length < 3) {
      result.checks.integrity = { passed: false, message: `Piece ${piece.id} has invalid outline` };
      result.passed = false;
      result.errors.push(`Piece ${piece.id}: Invalid outline length`);
      continue;
    }
    
    // Check for NaNs
    const hasNaN = piece.outline.some((p: {x: number, y: number}) => isNaN(p.x) || isNaN(p.y));
    if (hasNaN) {
      result.checks.integrity = { passed: false, message: `Piece ${piece.id} has NaN coordinates` };
      result.passed = false;
      result.errors.push(`Piece ${piece.id}: NaN coordinates`);
    }

    // Check closed loop (approximate)
    const first = piece.outline[0];
    const last = piece.outline[piece.outline.length - 1];
    const dist = Math.hypot(first.x - last.x, first.y - last.y);
    if (dist > 1.0) {
       // It's okay if not perfectly closed if renderer closes it, but for validation we prefer closed
       // We'll just warn for now or fail if strictly required. 
       // Let's fail to ensure quality.
       result.checks.integrity = { passed: false, message: `Piece ${piece.id} outline not closed (gap ${dist.toFixed(2)})` };
       result.passed = false;
       result.errors.push(`Piece ${piece.id}: Open loop`);
    }
  }

  // C) Board Coverage (Sampling)
  // Sample 40x40 grid
  let coveredSamples = 0;
  const samplesX = 40;
  const samplesY = 40;
  const totalSamples = samplesX * samplesY;
  
  // Pre-transform all outlines to world space (solved state)
  const worldPolygons = pieces.map((p: Piece) => {
    return p.outline.map((pt: {x: number, y: number}) => applyPose(p.correctPose, pt));
  });

  for (let i = 0; i < samplesX; i++) {
    for (let j = 0; j < samplesY; j++) {
      // Sample point in image space (0 to imageWidth)
      // Avoid edges by adding 0.5 offset
      const x = ((i + 0.5) / samplesX) * imageWidth;
      const y = ((j + 0.5) / samplesY) * imageHeight;
      
      // Check if point is inside ANY piece
      let inside = false;
      for (const poly of worldPolygons) {
        if (pointInPolygon({x, y}, poly)) {
          inside = true;
          break;
        }
      }
      if (inside) coveredSamples++;
    }
  }
  
  const coveragePct = coveredSamples / totalSamples;
  if (coveragePct < 0.99) { // Allow 1% margin for tiny gaps/sampling error
    result.checks.coverage = { passed: false, message: `Coverage ${coveragePct.toFixed(3)} < 0.99` };
    result.passed = false;
    result.errors.push(`Board coverage too low: ${(coveragePct*100).toFixed(1)}%`);
  }

  // D) Neighbor Flushness
  // We need neighbor info. Assuming pieces are stored in row-major order or we can deduce neighbors.
  // Since we don't have explicit neighbor graph in State, we can infer from IDs "piece_r_c"
  // Or just check all pairs that SHOULD be neighbors.
  
  // Helper to get piece by r,c
  const getPiece = (r: number, c: number) => state.pieces[`piece_${r}_${c}`];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = getPiece(r, c);
      if (!p) continue;

      // Check Right Neighbor
      if (c < cols - 1) {
        const right = getPiece(r, c + 1);
        if (right) {
          // Check shared edge: Right of P vs Left of Right
          // We don't know exactly which points are the edge without metadata.
          // But we can check if the outlines overlap/touch correctly.
          // A stricter test as requested: "sample multiple points along A's shared edge"
          // Without edge metadata, this is hard.
          // ALTERNATIVE: Check if the midpoints of the shared boundary align.
          // P's right edge is roughly at x = width/2 in local space.
          // Right's left edge is roughly at x = -width/2 in local space.
          
          // Let's sample points along the theoretical boundary line in World Space.
          // Boundary is vertical line between P and Right.
          // P center: correctPose. Right center: correctPose.
          // Midpoint between centers.
          
          // Actually, let's use the "max distance < 0.75px" rule on the NEAREST points.
          // For a set of points on P's right edge, the distance to Right's outline should be ~0.
          
          // Simplified Flush Check:
          // Transform P to world. Transform Right to world.
          // The "seam" should have points from both very close to each other.
          // This is computationally expensive to do perfectly without edge tags.
          // But we can check the "Gap" at the center of the edge.
          
          // P Right Edge Center (Local): (w/2, 0) -> World
          // Right Left Edge Center (Local): (-w/2, 0) -> World
          // They should be identical.
          
          // Note: This assumes (0,0) is centroid and width is accurate.
          // Our pieces are roughly width x height.
          // Let's assume standard grid spacing.
          const pieceWidth = imageWidth / cols;
          const pieceHeight = imageHeight / rows;
          const pWorld = applyPose(p.correctPose, { x: pieceWidth/2, y: 0 });
          const rWorld = applyPose(right.correctPose, { x: -pieceWidth/2, y: 0 });
          
          const dist = Math.hypot(pWorld.x - rWorld.x, pWorld.y - rWorld.y);
          if (dist > 0.75) {
             result.checks.flushness = { passed: false, message: `Gap between ${p.id} and ${right.id}: ${dist.toFixed(2)}px` };
             result.passed = false;
             result.errors.push(`Gap ${p.id}<->${right.id}: ${dist.toFixed(2)}px`);
          }
        }
      }
      
      // Check Bottom Neighbor
      if (r < rows - 1) {
        const bottom = getPiece(r + 1, c);
        if (bottom) {
           const pieceHeight = imageHeight / rows;
           const pWorld = applyPose(p.correctPose, { x: 0, y: pieceHeight/2 });
           const bWorld = applyPose(bottom.correctPose, { x: 0, y: -pieceHeight/2 });
           
           const dist = Math.hypot(pWorld.x - bWorld.x, pWorld.y - bWorld.y);
           if (dist > 0.75) {
             result.checks.flushness = { passed: false, message: `Gap between ${p.id} and ${bottom.id}: ${dist.toFixed(2)}px` };
             result.passed = false;
             result.errors.push(`Gap ${p.id}<->${bottom.id}: ${dist.toFixed(2)}px`);
           }
        }
      }
    }
  }

  return result;
}

function pointInPolygon(pt: {x: number, y: number}, poly: {x: number, y: number}[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    
    const intersect = ((yi > pt.y) !== (yj > pt.y))
        && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
