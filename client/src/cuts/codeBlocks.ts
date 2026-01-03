import { Piece, PuzzleConfig, Point, Neighbor } from '../engine/types';
import { CutGenerator, generateSeed } from './types';

export const codeBlocks: CutGenerator = {
  generate: async (config: PuzzleConfig) => {
    const { image, rows, cols, seed } = config;
    const rng = generateSeed(seed);
    const pieces: Piece[] = [];
    
    // BSP (Binary Space Partitioning) to create code-block like rectangles
    // Start with full rect
    const areas = [{ x: 0, y: 0, w: image.width, h: image.height }];
    
    const targetCount = rows * cols;
    
    while (areas.length < targetCount) {
      // Pick a random area to split
      // Prefer larger areas
      areas.sort((a, b) => (b.w * b.h) - (a.w * a.h));
      const toSplit = areas.shift()!;
      
      // Decide split direction (horizontal or vertical)
      // Prefer splitting the longer dimension
      const splitVert = toSplit.w > toSplit.h;
      
      if (splitVert) {
        const splitPos = 0.3 + rng() * 0.4; // 30% to 70%
        const w1 = toSplit.w * splitPos;
        const w2 = toSplit.w - w1;
        areas.push({ x: toSplit.x, y: toSplit.y, w: w1, h: toSplit.h });
        areas.push({ x: toSplit.x + w1, y: toSplit.y, w: w2, h: toSplit.h });
      } else {
        const splitPos = 0.3 + rng() * 0.4;
        const h1 = toSplit.h * splitPos;
        const h2 = toSplit.h - h1;
        areas.push({ x: toSplit.x, y: toSplit.y, w: toSplit.w, h: h1 });
        areas.push({ x: toSplit.x, y: toSplit.y + h1, w: toSplit.w, h: h2 });
      }
    }
    
    // Convert areas to pieces
    areas.forEach((area, index) => {
      const cx = area.x + area.w / 2;
      const cy = area.y + area.h / 2;
      
      const outline: Point[] = [
        { x: -area.w/2, y: -area.h/2 },
        { x: area.w/2, y: -area.h/2 },
        { x: area.w/2, y: area.h/2 },
        { x: -area.w/2, y: area.h/2 },
      ];
      
      // Add "code block" notch/tab?
      // Prompt says "rectangular 'blocks' (like code editor tiles)".
      // Simple rects are fine, adjacency handles the locking.
      
      pieces.push({
        id: `block_${index}`,
        outline,
        centroid: { x: cx, y: cy },
        correctPose: { x: cx, y: cy, rotation: 0 },
        currentPose: { x: cx, y: cy, rotation: 0 },
        neighbors: [],
        groupId: `block_${index}`,
        zIndex: 0,
        isLocked: false,
        // @ts-ignore
        _bounds: { left: area.x, right: area.x + area.w, top: area.y, bottom: area.y + area.h }
      });
    });
    
    // Compute neighbors (shared borders)
    for (let i = 0; i < pieces.length; i++) {
      const p1 = pieces[i];
      // @ts-ignore
      const b1 = p1._bounds;
      
      for (let j = i + 1; j < pieces.length; j++) {
        const p2 = pieces[j];
        // @ts-ignore
        const b2 = p2._bounds;
        
        // Check for shared edge
        // Vertical edge share: x matches, y overlaps
        const shareVert = (Math.abs(b1.right - b2.left) < 1 || Math.abs(b1.left - b2.right) < 1) &&
                          (b1.bottom > b2.top && b1.top < b2.bottom);
                          
        // Horizontal edge share: y matches, x overlaps
        const shareHorz = (Math.abs(b1.bottom - b2.top) < 1 || Math.abs(b1.top - b2.bottom) < 1) &&
                          (b1.right > b2.left && b1.left < b2.right);
                          
        if (shareVert || shareHorz) {
           const dx = p2.correctPose.x - p1.correctPose.x;
           const dy = p2.correctPose.y - p1.correctPose.y;
           
           p1.neighbors.push({
             otherId: p2.id,
             deltaPose: { x: dx, y: dy, rotation: 0 },
             edgeKey: `${p1.id}-${p2.id}`
           });
           
           p2.neighbors.push({
             otherId: p1.id,
             deltaPose: { x: -dx, y: -dy, rotation: 0 },
             edgeKey: `${p1.id}-${p2.id}`
           });
        }
      }
    }

    return pieces;
  },
};
