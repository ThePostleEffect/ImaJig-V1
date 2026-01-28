import { Piece, GameState, Point } from '../engine/types';
import { Camera } from './camera';

// Debug flag for depth rendering (not currently used since depth is disabled)
const DEBUG_DEPTH = false;

// Renderer look & feel toggles
const ENABLE_GLOSS = true;
// Performance: clamp DPR to prevent excessive canvas size on high-DPI displays
const MAX_DEVICE_PIXEL_RATIO = 1.25;
// Depth rendering: DISABLED - set to 0 to use standard rendering for all puzzles
const DEPTH_PIECE_THRESHOLD = 0;

// Edge-based bevel effect constants (visible but tasteful)
const BEVEL_HIGHLIGHT_ALPHA = 0.18; // Top-left rim highlight
const BEVEL_SHADOW_ALPHA = 0.20;    // Bottom-right rim shadow
const BEVEL_SHEEN_ALPHA = 0.06;     // Subtle top-left sheen (matte cardboard)
const BEVEL_OFFSET = 1.5;           // Pixel offset for rim effect

// Snap glow effect settings
const SNAP_GLOW_COLOR = 'rgba(59, 130, 246, 1)'; // Blue glow (Tailwind blue-500)
const SNAP_GLOW_DURATION = 400; // milliseconds
const SNAP_GLOW_BLUR = 15; // blur radius in pixels

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private image: HTMLImageElement | null = null;
  private pathCache: Map<string, Path2D> = new Map();
  private shadedSpriteCache: Map<string, HTMLCanvasElement | ImageBitmap> = new Map();
  private enableDepthRendering = false;
  private depthRenderingDisabled = false; // Safety flag if depth rendering fails
  private failedSpriteIds = new Set<string>(); // Track pieces that failed sprite creation
  private globalFailureCount = 0; // Track total failures to disable globally if too many
  private debugLoggedDepthMode = false; // One-time debug log flag
  
  // Debug counters for tracking sprite usage
  private debugShadedDrawCount = 0;
  private debugFallbackDrawCount = 0;
  private debugLoggedCounts = false;
  
  // Snap glow effect: maps piece ID to glow start time
  private snapGlowPieces: Map<string, number> = new Map();

  private getCurrentScale(ctx: CanvasRenderingContext2D): number {
    // We draw pieces after camera scale() and per-piece rotate(); infer scale from the matrix.
    // With rotation present, scale is sqrt(a^2 + b^2).
    const m = ctx.getTransform();
    return Math.hypot(m.a, m.b) || 1;
  }

  private getPieceBounds(piece: Piece): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of piece.outline) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }
    return { minX, minY, maxX, maxY };
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true })!;
  }

  setImage(img: HTMLImageElement) {
    this.image = img;
  }
  
  // Trigger a blue glow effect on a piece (called when pieces snap together)
  triggerSnapGlow(pieceId: string) {
    this.snapGlowPieces.set(pieceId, performance.now());
  }
  
  // Trigger glow on multiple pieces (e.g., entire group)
  triggerSnapGlowGroup(pieceIds: string[]) {
    const now = performance.now();
    for (const id of pieceIds) {
      this.snapGlowPieces.set(id, now);
    }
  }

  resize(width: number, height: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
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

  private createShadedSprite(piece: Piece): HTMLCanvasElement | ImageBitmap {
    if (!this.image) {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      return canvas;
    }

    const bounds = this.getPieceBounds(piece);
    const padding = 20; // Extra space for bevel/shadow effects
    const width = Math.ceil(bounds.maxX - bounds.minX) + padding * 2;
    const height = Math.ceil(bounds.maxY - bounds.minY) + padding * 2;
    
    // Debug: warn if bounds seem suspiciously small
    if (DEBUG_DEPTH && (width < 20 || height < 20)) {
      console.warn(`[DEPTH DEBUG] Piece ${piece.id} has small bounds: ${width}x${height}`);
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const ctx = canvas.getContext('2d')!;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    try {
      // COORDINATE MAPPING:
      // - Piece outline points are in IMAGE coordinates (0,0 = image top-left)
      // - We want to render on a small sprite canvas with padding
      // - Image point (bounds.minX, bounds.minY) should appear at sprite (padding, padding)
      //
      // Transform: spriteCoord = imageCoord - bounds.min + padding
      // So we translate by (-bounds.minX + padding, -bounds.minY + padding)
      
      const tx = -bounds.minX + padding;
      const ty = -bounds.minY + padding;
      
      // Create a TRANSLATED path for use in sprite-local coordinates
      const spritePath = new Path2D();
      if (piece.outline.length > 0) {
        spritePath.moveTo(piece.outline[0].x + tx, piece.outline[0].y + ty);
        for (let i = 1; i < piece.outline.length; i++) {
          spritePath.lineTo(piece.outline[i].x + tx, piece.outline[i].y + ty);
        }
        spritePath.closePath();
      }
      
      // ===== EDGE-BASED BEVEL TECHNIQUE =====
      // All operations now use sprite-local coordinates (no transform needed)
      
      // Step 1: Draw shadow rim (bottom-right offset, dark)
      ctx.save();
      ctx.translate(BEVEL_OFFSET, BEVEL_OFFSET);
      ctx.clip(spritePath);
      ctx.translate(-BEVEL_OFFSET, -BEVEL_OFFSET);
      ctx.globalAlpha = BEVEL_SHADOW_ALPHA;
      ctx.fillStyle = '#000000';
      ctx.fill(spritePath);
      ctx.restore();
      
      // Step 2: Draw highlight rim (top-left offset, light)
      ctx.save();
      ctx.translate(-BEVEL_OFFSET, -BEVEL_OFFSET);
      ctx.clip(spritePath);
      ctx.translate(BEVEL_OFFSET, BEVEL_OFFSET);
      ctx.globalAlpha = BEVEL_HIGHLIGHT_ALPHA;
      ctx.fillStyle = '#FFFFFF';
      ctx.fill(spritePath);
      ctx.restore();
      
      // Step 3: Draw base image clipped to piece shape
      // Use 9-argument drawImage to sample EXACTLY the piece's region
      ctx.save();
      ctx.clip(spritePath);
      ctx.globalAlpha = 1.0;
      // Draw the full image offset so correct region appears in sprite
      ctx.drawImage(this.image, tx, ty);
      ctx.restore();
      
      // Step 4: Add subtle inner bevel using source-atop compositing
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.translate(BEVEL_OFFSET * 0.5, BEVEL_OFFSET * 0.5);
      ctx.globalAlpha = BEVEL_SHADOW_ALPHA * 0.7;
      ctx.fillStyle = '#000000';
      ctx.fill(spritePath);
      ctx.restore();
      
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.translate(-BEVEL_OFFSET * 0.5, -BEVEL_OFFSET * 0.5);
      ctx.globalAlpha = BEVEL_HIGHLIGHT_ALPHA * 0.5;
      ctx.fillStyle = '#FFFFFF';
      ctx.fill(spritePath);
      ctx.restore();
      
      // Step 5: Subtle top-left sheen for "matte cardboard" look
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      const gradient = ctx.createLinearGradient(
        padding, padding,
        padding + (bounds.maxX - bounds.minX), padding + (bounds.maxY - bounds.minY)
      );
      gradient.addColorStop(0, `rgba(255,255,255,${BEVEL_SHEEN_ALPHA})`);
      gradient.addColorStop(0.4, 'rgba(255,255,255,0)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.fill(spritePath);
      ctx.restore();
      
      // Step 6: DEBUG visuals when DEBUG_DEPTH is enabled
      if (DEBUG_DEPTH) {
        // Draw magenta dot in corner
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = '#FF00FF';
        ctx.beginPath();
        ctx.arc(padding + 5, padding + 5, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        
        // Draw cyan rectangle around sprite bounds to visualize cropping
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
        ctx.strokeStyle = '#00FFFF';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
        ctx.restore();
      }
      
    } catch (error) {
      console.warn(`Error creating shaded sprite for piece ${piece.id}:`, error);
      this.failedSpriteIds.add(piece.id);
      this.globalFailureCount++;
      
      if (this.globalFailureCount >= 5) {
        console.warn('Too many sprite creation failures, disabling depth rendering for this session');
        this.depthRenderingDisabled = true;
      }
      
      const fallbackCanvas = document.createElement('canvas');
      fallbackCanvas.width = 1;
      fallbackCanvas.height = 1;
      return fallbackCanvas;
    }
    
    // Convert to ImageBitmap if supported for faster drawing
    if (typeof createImageBitmap !== 'undefined') {
      try {
        createImageBitmap(canvas).then(bitmap => {
          this.shadedSpriteCache.set(piece.id, bitmap);
        }).catch((error) => {
          console.warn('ImageBitmap creation failed, using canvas fallback:', error);
          // Keep the canvas in cache instead
          this.shadedSpriteCache.set(piece.id, canvas);
        });
        return canvas; // Return canvas immediately while bitmap is being created
      } catch (error) {
        console.warn('createImageBitmap not available:', error);
        return canvas;
      }
    }
    
    return canvas;
  }

  render(gameState: GameState, camera: Camera, activeDraggedPieceId?: string) {
    if (!this.image) return;

    const { width, height } = this.canvas;
    const ctx = this.ctx;
    const pieceCount = Object.keys(gameState.pieces).length;
    
    // Enable depth rendering only for small puzzles (and if not disabled due to errors)
    this.enableDepthRendering = pieceCount <= DEPTH_PIECE_THRESHOLD && !this.depthRenderingDisabled;
    
    // Debug logging (one-time per session)
    if (this.enableDepthRendering && !this.debugLoggedDepthMode) {
      console.log(`Depth mode active: using shaded sprites for ${pieceCount} pieces (threshold: ${DEPTH_PIECE_THRESHOLD})`);
      this.debugLoggedDepthMode = true;
    }

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
    const pieces = Object.values(gameState.pieces)
      .filter(p => !p.inTray)
      .sort((a, b) => {
      if (a.isLocked !== b.isLocked) return a.isLocked ? -1 : 1; // Locked pieces at bottom
      return a.zIndex - b.zIndex;
    });

    // Reset debug counters before drawing
    if (DEBUG_DEPTH) {
      this.debugShadedDrawCount = 0;
      this.debugFallbackDrawCount = 0;
    }
    
    // Current time for glow animation
    const now = performance.now();

    for (const piece of pieces) {
      const isHovered = activeDraggedPieceId === piece.id;
      const isDragging = isHovered;
      
      // Calculate glow alpha for snap effect
      let glowAlpha = 0;
      const glowStart = this.snapGlowPieces.get(piece.id);
      if (glowStart !== undefined) {
        const elapsed = now - glowStart;
        if (elapsed < SNAP_GLOW_DURATION) {
          // Ease out: starts bright, fades to 0
          glowAlpha = 1 - (elapsed / SNAP_GLOW_DURATION);
          glowAlpha = glowAlpha * glowAlpha; // Quadratic ease-out for smoother fade
        } else {
          // Glow finished, remove from map
          this.snapGlowPieces.delete(piece.id);
        }
      }
      
      this.drawPiece(ctx, piece, isHovered, isDragging, glowAlpha);
    }

    // Log debug counts once per session
    if (DEBUG_DEPTH && !this.debugLoggedCounts && this.enableDepthRendering) {
      console.log(`[DEPTH DEBUG] Frame draw stats: ${this.debugShadedDrawCount} shaded sprites, ${this.debugFallbackDrawCount} fallback draws`);
      if (this.debugShadedDrawCount > 0) {
        console.log(`[DEPTH DEBUG] ✓ Shaded sprites ARE being used! Look for magenta dots in piece corners.`);
      } else {
        console.log(`[DEPTH DEBUG] ✗ No shaded sprites used this frame. Check for errors above.`);
      }
      this.debugLoggedCounts = true;
    }

    ctx.restore();
  }

  private drawPiece(ctx: CanvasRenderingContext2D, piece: Piece, isHovered: boolean, isDragging: boolean, glowAlpha: number = 0) {
    if (!this.image) return;

    ctx.save();
    
    // Transform to piece position
    ctx.translate(piece.currentPose.x, piece.currentPose.y);
    ctx.rotate(piece.currentPose.rotation);

    // Apply subtle scale increase while dragging for "lift" effect
    if (isDragging) {
      const liftScale = 1.03;
      ctx.scale(liftScale, liftScale);
    }

    const scale = this.getCurrentScale(ctx);
    const invScale = 1 / scale;

    const path = this.getPiecePath(piece);
    
    // (0) Blue snap glow effect - draw BEFORE piece for underglow effect
    if (glowAlpha > 0) {
      ctx.save();
      ctx.shadowColor = SNAP_GLOW_COLOR;
      ctx.shadowBlur = SNAP_GLOW_BLUR * invScale * glowAlpha;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.globalAlpha = glowAlpha * 0.8;
      ctx.fillStyle = SNAP_GLOW_COLOR;
      ctx.fill(path);
      ctx.restore();
    }

    // (a) Drop shadow - ONLY for dragged piece to improve performance
    if (isDragging) {
      const blurPx = 28;
      const offsetPx = 12;
      const alpha = 0.45;

      ctx.save();
      ctx.shadowColor = `rgba(0,0,0,${alpha})`;
      ctx.shadowBlur = blurPx * invScale;
      ctx.shadowOffsetX = offsetPx * invScale;
      ctx.shadowOffsetY = offsetPx * invScale;
      // Fill will be covered by the image; it's only here to generate the shadow.
      ctx.fillStyle = 'rgba(0,0,0,1)';
      ctx.fill(path);
      ctx.restore();
    }

    // (b) Draw piece - use shaded sprite if available and depth rendering enabled
    if (this.enableDepthRendering && !isDragging) {
      // Skip pieces that we know have failed sprite creation
      if (this.failedSpriteIds.has(piece.id)) {
        // Use standard rendering for this failed piece
      } else {
        // Use cached shaded sprite for static pieces in small puzzles
        let sprite = this.shadedSpriteCache.get(piece.id);
        if (!sprite) {
          sprite = this.createShadedSprite(piece);
          this.shadedSpriteCache.set(piece.id, sprite);
          console.log(`Created shaded sprite for piece ${piece.id}`);
        }
        
        // Validate sprite and use it if valid, otherwise fallback to standard rendering
        let useSprite = false;
        if (sprite instanceof HTMLCanvasElement) {
          useSprite = sprite.width > 1 && sprite.height > 1;
        } else if (sprite instanceof ImageBitmap) {
          useSprite = sprite.width > 1 && sprite.height > 1;
        }
        
        if (useSprite) {
          try {
            const bounds = this.getPieceBounds(piece);
            const padding = 20;
            // The sprite was created with the piece at offset (padding - bounds.minX, padding - bounds.minY)
            // In the sprite, the piece centroid is at position:
            //   spriteX = padding + (centroid.x - bounds.minX)
            //   spriteY = padding + (centroid.y - bounds.minY)
            // We need to draw the sprite so centroid aligns with (0,0) in current space
            // So sprite origin should be at: (-spriteX, -spriteY) = (bounds.minX - padding - centroid.x, ...)
            ctx.drawImage(
              sprite, 
              bounds.minX - padding - piece.centroid.x, 
              bounds.minY - padding - piece.centroid.y
            );
            // Debug: track successful shaded sprite usage
            if (DEBUG_DEPTH) {
              this.debugShadedDrawCount++;
            }
            // Successfully used shaded sprite - skip standard rendering
            ctx.restore();
            return;
          } catch (error) {
            console.warn('Error drawing shaded sprite, falling back to standard rendering:', error);
            this.failedSpriteIds.add(piece.id); // Mark as failed
            if (DEBUG_DEPTH) {
              this.debugFallbackDrawCount++;
            }
            useSprite = false;
          }
        }
        
        // If we get here, sprite failed - use standard rendering
        if (!useSprite) {
          console.warn(`Shaded sprite failed for piece ${piece.id}, using standard rendering`);
          this.failedSpriteIds.add(piece.id); // Mark as failed
          if (DEBUG_DEPTH) {
            this.debugFallbackDrawCount++;
          }
          // Remove bad sprite from cache
          this.shadedSpriteCache.delete(piece.id);
        }
      }
    } else if (DEBUG_DEPTH && !isDragging) {
      // Track fallback draws for non-depth-rendered pieces
      this.debugFallbackDrawCount++;
    }
    // Standard rendering path (dragged pieces, large puzzles, or sprite fallback)
    {
      
      // Clip and Draw Image with optimized bleed
      ctx.save();
      ctx.clip(path);
      
      ctx.translate(-piece.centroid.x, -piece.centroid.y);
      
      // For performance: reduce texture bleed on non-dragged pieces
      if (isDragging) {
        // Full texture bleed for dragged piece (smooth edges while moving)
        const bleed = 1.0 * invScale;
        ctx.drawImage(this.image, -bleed, 0);
        ctx.drawImage(this.image, bleed, 0);
        ctx.drawImage(this.image, 0, -bleed);
        ctx.drawImage(this.image, 0, bleed);
        ctx.drawImage(this.image, 0, 0); // Center last
      } else {
        // Simple single draw for static pieces
        ctx.drawImage(this.image, 0, 0);
      }
      
      ctx.restore();

      // (c) Bevel / edge depth shading - ONLY for dragged piece
      if (isDragging) {
      const bevelWidthPx = 3.0;
      const bevelOffsetPx = 1.8;
      const bevelWidth = bevelWidthPx * invScale;
      const bevelOffset = bevelOffsetPx * invScale;

      ctx.save();
      ctx.clip(path);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.lineWidth = bevelWidth;

      // Top/left highlight (light from top-left)
      ctx.save();
      ctx.translate(-bevelOffset, -bevelOffset);
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = 'rgba(255,255,255,1)';
      ctx.stroke(path);
      ctx.restore();

      // Bottom/right shadow
      ctx.save();
      ctx.translate(bevelOffset, bevelOffset);
      ctx.globalAlpha = 0.20;
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.stroke(path);
      ctx.restore();

      ctx.restore();
    }

    // (d) Optional gloss/shine overlay - ONLY for dragged piece
    if (ENABLE_GLOSS && isDragging) {
      const { minX, minY, maxX, maxY } = this.getPieceBounds(piece);
      if (maxX > minX && maxY > minY) {
        ctx.save();
        ctx.clip(path);
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.16;

        const g = ctx.createLinearGradient(minX, minY, maxX, maxY);
        g.addColorStop(0.0, 'rgba(255,255,255,0.00)');
        g.addColorStop(0.26, 'rgba(255,255,255,0.14)');
        g.addColorStop(0.48, 'rgba(255,255,255,0.00)');
        g.addColorStop(1.0, 'rgba(255,255,255,0.00)');
        ctx.fillStyle = g;
        ctx.fillRect(minX, minY, maxX - minX, maxY - minY);

        ctx.restore();
      }
    }
    } // End of standard rendering block

    // Draw Stroke
    ctx.lineWidth = 2 * invScale;
    ctx.strokeStyle = isHovered ? '#2D5BFF' : '#000000'; // Blue if hovered, Black otherwise
    if (isHovered) ctx.lineWidth = 4 * invScale;
    
    ctx.stroke(path);

    ctx.restore();
  }
}
