import { Piece, GameState, Point } from '../engine/types';
import { Camera } from './camera';

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private image: HTMLImageElement | null = null;
  private pathCache: Map<string, Path2D> = new Map();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true })!;
  }

  setImage(img: HTMLImageElement) {
    this.image = img;
  }

  resize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  private getPiecePath(piece: Piece): Path2D {
    if (this.pathCache.has(piece.id)) {
      return this.pathCache.get(piece.id)!;
    }

    const path = new Path2D();
    if (piece.outline.length > 0) {
      path.moveTo(piece.outline[0].x, piece.outline[0].y);
      for (let i = 1; i < piece.outline.length; i++) {
        path.lineTo(piece.outline[i].x, piece.outline[i].y);
      }
      path.closePath();
    }
    
    this.pathCache.set(piece.id, path);
    return path;
  }

  render(gameState: GameState, camera: Camera, hoveredPieceId?: string) {
    if (!this.image) return;

    const { width, height } = this.canvas;
    const ctx = this.ctx;

    // Clear canvas to let CSS background show through
    ctx.clearRect(0, 0, width, height);

    ctx.save();
    
    // Apply camera transform
    // We want to center the camera view.
    // camera.x/y is the world coordinate at the top-left of the screen?
    // In camera.ts: screenToWorld(x,y) = (x/zoom + this.x, y/zoom + this.y)
    // So yes.
    
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    // Draw Board Frame (World Space)
    const puzzleW = this.image.width;
    const puzzleH = this.image.height;
    
    // Draw a "felt" or "wood" area for the puzzle to sit in
    // Let's make it slightly larger than the puzzle
    const framePadding = 50;
    
    // Shadow under the board area
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 10;
    ctx.shadowOffsetY = 10;
    
    // Board Area (Semi-transparent overlay to define the play area)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'; // Subtle highlight for the board
    ctx.fillRect(-framePadding, -framePadding, puzzleW + framePadding*2, puzzleH + framePadding*2);
    
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    // Puzzle Frame (Black Border around puzzle area)
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4 / camera.zoom;
    ctx.strokeRect(0, 0, puzzleW, puzzleH);
    
    // Inner Shadow/Darkness for Puzzle Area (where pieces go)
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(0, 0, puzzleW, puzzleH);

    // Sort pieces by zIndex (and groups)
    const pieces = Object.values(gameState.pieces).sort((a, b) => {
      if (a.isLocked !== b.isLocked) return a.isLocked ? -1 : 1; // Locked pieces at bottom
      return a.zIndex - b.zIndex;
    });

    for (const piece of pieces) {
      this.drawPiece(ctx, piece, hoveredPieceId === piece.id);
    }

    ctx.restore();
  }

  private drawPiece(ctx: CanvasRenderingContext2D, piece: Piece, isHovered: boolean) {
    if (!this.image) return;

    ctx.save();
    
    // Transform to piece position
    ctx.translate(piece.currentPose.x, piece.currentPose.y);
    ctx.rotate(piece.currentPose.rotation);

    const path = this.getPiecePath(piece);

    // Draw Shadow
    if (!piece.isLocked) {
      ctx.save();
      const shadowOffset = 4 / 1; // Fixed shadow offset
      ctx.translate(shadowOffset, shadowOffset);
      // Neo-brutalism hard shadow
      ctx.fillStyle = 'rgba(0,0,0,1)'; 
      ctx.fill(path);
      ctx.restore();
    }

    // Clip and Draw Image with Bleed
    ctx.save();
    ctx.clip(path);
    
    ctx.translate(-piece.centroid.x, -piece.centroid.y);
    
    // Draw multiple times with slight offset to cover anti-aliasing seams
    // This is a simple "texture bleed" technique
    const bleed = 1.0; // Increased to 1.0px to fix visible gaps
    ctx.drawImage(this.image, -bleed, 0);
    ctx.drawImage(this.image, bleed, 0);
    ctx.drawImage(this.image, 0, -bleed);
    ctx.drawImage(this.image, 0, bleed);
    ctx.drawImage(this.image, 0, 0); // Center last
    
    ctx.restore();

    // Draw Stroke
    ctx.lineWidth = 2 / 1; 
    ctx.strokeStyle = isHovered ? '#2D5BFF' : '#000000'; // Blue if hovered, Black otherwise
    if (isHovered) ctx.lineWidth = 4 / 1;
    
    ctx.stroke(path);

    ctx.restore();
  }
}
