import React, { useRef, useEffect, useState } from 'react';
import { useGesture } from '@use-gesture/react';
import confetti from 'canvas-confetti';
import { CanvasRenderer as PuzzleRenderer } from '../render/canvasRenderer';
import { Camera } from '../render/camera';
import { PuzzleGenerator } from '../engine/generator';
import { generateSeed } from '../cuts/types';
import { GameState, Piece, Point, PuzzleConfig } from '../engine/types';
import { UnionFind } from '../engine/unionFind';
import { SpatialHash } from '../engine/spatialHash';
import { AudioManager } from '../engine/audio';
import { DebugOverlay } from './DebugOverlay';
import { preloadSfx, playPlacementSfx, playCelebrationSfx, unlockSfx } from '../audio/sfx';

interface PuzzleBoardProps {
  config: PuzzleConfig;
  onExit: () => void;
  onSave: (state: GameState, thumbnail: Blob) => void;
  initialState?: GameState;
}

const getPieceBounds = (piece: Piece) => {
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
};

type TrayPieceProps = {
  piece: Piece;
  image: HTMLImageElement;
  size: number;
  onPointerDown: (pieceId: string, event: React.PointerEvent<HTMLButtonElement>) => void;
};

const TrayPiece: React.FC<TrayPieceProps> = ({ piece, image, size, onPointerDown }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || !image) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const bounds = getPieceBounds(piece);
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    if (width <= 0 || height <= 0) return;

    const padding = 6;
    const scale = Math.min(
      (canvas.width - padding * 2) / width,
      (canvas.height - padding * 2) / height
    );

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(scale, scale);

    const path = new Path2D();
    if (piece.outline.length > 0) {
      path.moveTo(piece.outline[0].x, piece.outline[0].y);
      for (let i = 1; i < piece.outline.length; i++) {
        path.lineTo(piece.outline[i].x, piece.outline[i].y);
      }
      path.closePath();
    }

    ctx.save();
    ctx.clip(path);
    ctx.translate(-piece.centroid.x, -piece.centroid.y);
    ctx.drawImage(image, 0, 0);
    ctx.restore();

    ctx.lineWidth = Math.max(1, 2 / scale);
    ctx.strokeStyle = '#000000';
    ctx.stroke(path);

    ctx.restore();
    canvas.style.setProperty('user-select', 'none');
    canvas.style.setProperty('touch-action', 'none');
  }, [piece, image, size]);

  return (
    <button
      type="button"
      className="shrink-0 p-1 border border-white/25 bg-white/10 rounded-xl shadow-[0_6px_14px_rgba(0,0,0,0.18)] active:translate-x-[1px] active:translate-y-[1px] touch-none select-none"
      onPointerDown={(event) => onPointerDown(piece.id, event)}
    >
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="block"
        style={{ touchAction: 'none', userSelect: 'none' }}
      />
    </button>
  );
};

export const PuzzleBoard: React.FC<PuzzleBoardProps> = ({ config, onExit, onSave, initialState }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<PuzzleRenderer | null>(null);
  const gameStateRef = useRef<GameState | null>(null);
  const unionFindRef = useRef<UnionFind | null>(null);
  const spatialHashRef = useRef<SpatialHash>(new SpatialHash(100));
  const cameraRef = useRef(new Camera(0, 0, 1));

  const [elapsedTime, setElapsedTime] = useState(0);
  const [moveCount, setMoveCount] = useState(0);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [audioManager] = useState(() => new AudioManager());
  const [background, setBackground] = useState<'felt' | 'dark' | 'wood' | 'blue'>('felt');
  const [showGhost, setShowGhost] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [trayIds, setTrayIds] = useState<string[]>([]);
  const [shuffleSeed, setShuffleSeed] = useState(0);
  const [trayHeight, setTrayHeight] = useState(() => {
    if (typeof window === 'undefined') return 180;
    return Math.max(160, Math.min(220, Math.round(window.innerHeight * 0.22)));
  });
  const sfxUnlockedRef = useRef(false);
  const trayDragRef = useRef<{ id: string; lastX: number; lastY: number; pointerId: number } | null>(null);
  const forcedDragPieceIdRef = useRef<string | null>(null);
  const trayRef = useRef<HTMLDivElement | null>(null);
  const trayGrabOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const snapAssistRef = useRef<{ anchorId: string; targetPose: { x: number; y: number; rotation: number } } | null>(null);
  const trayInitRef = useRef(false);

  const draggingRef = useRef<{
    pieceId: string;
    startScreenPos: { x: number, y: number };
    startPiecePos: { x: number, y: number, rotation: number };
    groupOffsets: Record<string, Point>;
    targetPositions: Record<string, Point>; // Target positions for smoothing
    startTime: number; // For two-phase alpha timing
  } | null>(null);

  const animationFrameRef = useRef<number>();
  const smoothingAlpha = 0.22; // Normal smoothing factor
  const fastAlpha = 0.35; // Fast catch-up alpha for first 120ms
  const fastPhaseMs = 120; // Duration of fast alpha phase
  const initializedRef = useRef(false); // Guard against double initialization (React StrictMode)

  const bgStyles = {
    felt: { backgroundColor: '#2a2a2a', backgroundImage: 'radial-gradient(#333 1px, transparent 1px)', backgroundSize: '20px 20px' },
    dark: { backgroundColor: '#1a1a1a' },
    wood: { backgroundColor: '#5d4037', backgroundImage: 'linear-gradient(45deg, #4e342e 25%, transparent 25%, transparent 75%, #4e342e 75%, #4e342e), linear-gradient(45deg, #4e342e 25%, transparent 25%, transparent 75%, #4e342e 75%, #4e342e)', backgroundSize: '20px 20px', backgroundPosition: '0 0, 10px 10px' },
    blue: { backgroundColor: '#1e3a8a', backgroundImage: 'linear-gradient(#172554 1px, transparent 1px), linear-gradient(90deg, #172554 1px, transparent 1px)', backgroundSize: '20px 20px' }
  };

  const getTrayRect = () => {
    if (trayRef.current) {
      const rect = trayRef.current.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    }
    return {
      left: 0,
      top: window.innerHeight - trayHeight,
      right: window.innerWidth,
      bottom: window.innerHeight
    };
  };

  const isPointInTray = (x: number, y: number) => {
    const rect = getTrayRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  };

  const clampClientYToTray = (clientY: number) => {
    const rect = getTrayRect();
    return Math.min(clientY, rect.top - 12);
  };

  const shuffleIds = (ids: string[], seed: number) => {
    const rng = generateSeed(seed);
    const result = [...ids];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };

  const initTrayIds = (ids: string[]) => {
    if (trayInitRef.current) return;
    trayInitRef.current = true;
    setTrayIds(ids);
  };

  // Initialize
  useEffect(() => {
    if (!canvasRef.current) return;
    
    // Guard against React StrictMode double-mount
    if (initializedRef.current) {
      console.warn('[PuzzleBoard] Skipping duplicate initialization (StrictMode)');
      return;
    }
    initializedRef.current = true;

    // Unlock Web Audio + preload SFX on first user gesture (exactly once)
    const el = canvasRef.current;
    const unlockOnce = () => {
      if (sfxUnlockedRef.current) return;
      sfxUnlockedRef.current = true;
      unlockSfx().finally(() => {
        preloadSfx();
      });
    };
    el.addEventListener('pointerdown', unlockOnce, { once: true });

    // Setup renderer
    rendererRef.current = new PuzzleRenderer(canvasRef.current);
    rendererRef.current.setImage(config.image);
    
    const initGame = async () => {
      setIsLoading(true);
      const fitCameraToBounds = (minX: number, minY: number, maxX: number, maxY: number) => {
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;
        const boundsW = maxX - minX;
        const boundsH = maxY - minY;
        const zoomToFitW = screenW / boundsW;
        const zoomToFitH = screenH / boundsH;
        const marginFactor = 0.9;
        const initialZoom = Math.min(1, zoomToFitW, zoomToFitH) * marginFactor;
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        cameraRef.current.zoom = Math.max(0.2, initialZoom);
        cameraRef.current.x = centerX - screenW / 2 / cameraRef.current.zoom;
        cameraRef.current.y = centerY - screenH / 2 / cameraRef.current.zoom;
      };

      if (initialState) {
        gameStateRef.current = initialState;
        Object.values(initialState.pieces).forEach(p => {
          p.currentPose.rotation = 0;
          p.correctPose.rotation = 0;
        });
        setElapsedTime(initialState.elapsedTime);
        setMoveCount(initialState.moveCount);
        
        // Rebuild UnionFind
        unionFindRef.current = new UnionFind(Object.keys(initialState.pieces));
        
        // Re-merge connected pieces based on neighbors
        const pieces = Object.values(initialState.pieces);
        for (let i = 0; i < pieces.length; i++) {
          for (let j = i + 1; j < pieces.length; j++) {
            const p1 = pieces[i];
            const p2 = pieces[j];
            
            // Check if they are neighbors
            const neighbor = p1.neighbors.find(n => n.otherId === p2.id);
            if (neighbor) {
               // Check if they are aligned
               const dx = Math.abs((p1.currentPose.x - p1.correctPose.x) - (p2.currentPose.x - p2.correctPose.x));
               const dy = Math.abs((p1.currentPose.y - p1.correctPose.y) - (p2.currentPose.y - p2.correctPose.y));
               if (dx < 2 && dy < 2) {
                 unionFindRef.current.union(p1.id, p2.id);
               }
            }
          }
        }
        const hasSavedView =
          Number.isFinite(initialState.scale) &&
          Number.isFinite(initialState.pan?.x) &&
          Number.isFinite(initialState.pan?.y);

        if (hasSavedView) {
          cameraRef.current.zoom = initialState.scale;
          cameraRef.current.x = initialState.pan.x;
          cameraRef.current.y = initialState.pan.y;
        } else {
          const framePadding = 50;
          fitCameraToBounds(
            -framePadding,
            -framePadding,
            config.image.width + framePadding,
            config.image.height + framePadding
          );
        }

        const inTrayIds = Object.values(initialState.pieces)
          .filter(p => p.inTray)
          .map(p => p.id);
        initTrayIds(inTrayIds.length > 0 ? shuffleIds(inTrayIds, config.seed) : []);
      } else {
        const generator = new PuzzleGenerator();
        gameStateRef.current = await generator.generate(config);
        Object.values(gameStateRef.current.pieces).forEach(p => {
          p.currentPose.rotation = 0;
          p.correctPose.rotation = 0;
        });
        unionFindRef.current = new UnionFind(Object.keys(gameStateRef.current.pieces));
        
        // === DEV VALIDATION: Check puzzle generation invariants ===
        if (process.env.NODE_ENV === 'development') {
          const pieces = Object.values(gameStateRef.current.pieces);
          const expectedCount = config.rows * config.cols;
          console.log(`[PuzzleBoard] Generated ${pieces.length} pieces (expected ${expectedCount})`);
          
          // Check for duplicate IDs
          const idSet = new Set<string>();
          const duplicateIds: string[] = [];
          pieces.forEach(p => {
            if (idSet.has(p.id)) duplicateIds.push(p.id);
            idSet.add(p.id);
          });
          if (duplicateIds.length > 0) {
            console.error('[PuzzleBoard] DUPLICATE IDs found:', duplicateIds);
          }
          
          // Check for duplicate (row, col) from id
          const posSet = new Set<string>();
          const duplicatePos: string[] = [];
          pieces.forEach(p => {
            const pos = p.id; // IDs are piece_r_c
            if (posSet.has(pos)) duplicatePos.push(pos);
            posSet.add(pos);
          });
          if (duplicatePos.length > 0) {
            console.error('[PuzzleBoard] DUPLICATE positions found:', duplicatePos);
          }
          
          // Check neighbor edge consistency
          let edgeIssues = 0;
          pieces.forEach(p => {
            p.neighbors.forEach(n => {
              const neighbor = gameStateRef.current!.pieces[n.otherId];
              if (!neighbor) {
                console.error(`[PuzzleBoard] Missing neighbor ${n.otherId} for piece ${p.id}`);
                edgeIssues++;
              } else {
                const reverseNeighbor = neighbor.neighbors.find(nn => nn.otherId === p.id);
                if (!reverseNeighbor) {
                  console.error(`[PuzzleBoard] ${p.id} has neighbor ${n.otherId}, but reverse link missing`);
                  edgeIssues++;
                }
              }
            });
          });
          if (edgeIssues === 0) {
            console.log('[PuzzleBoard] ✓ All neighbor links valid');
          }
        }
        // === END VALIDATION ===
        
        // Initial shuffle - scatter pieces around the puzzle area
        const boardW = config.image.width * 1.5;
        const boardH = config.image.height * 1.5;
        Object.values(gameStateRef.current.pieces).forEach(p => {
          p.inTray = true;
          p.currentPose.x = (Math.random() - 0.5) * boardW + config.image.width/2;
          p.currentPose.y = (Math.random() - 0.5) * boardH + config.image.height/2;
          p.currentPose.rotation = 0;
        });
        initTrayIds(shuffleIds(Object.keys(gameStateRef.current.pieces), config.seed));
        
        // Calculate bounding box of all scattered pieces
        const pieces = Object.values(gameStateRef.current.pieces);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of pieces) {
          if (p.inTray) continue;
          // Estimate piece bounds (use centroid +/- half piece size)
          const halfW = config.image.width / config.cols / 2 + 30; // Add padding for tabs
          const halfH = config.image.height / config.rows / 2 + 30;
          minX = Math.min(minX, p.currentPose.x - halfW);
          minY = Math.min(minY, p.currentPose.y - halfH);
          maxX = Math.max(maxX, p.currentPose.x + halfW);
          maxY = Math.max(maxY, p.currentPose.y + halfH);
        }

        const framePadding = 50;
        const boardMinX = -framePadding;
        const boardMinY = -framePadding;
        const boardMaxX = config.image.width + framePadding;
        const boardMaxY = config.image.height + framePadding;

        const hasPieceBounds = Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY);
        const fitMinX = hasPieceBounds ? Math.min(minX, boardMinX) : boardMinX;
        const fitMinY = hasPieceBounds ? Math.min(minY, boardMinY) : boardMinY;
        const fitMaxX = hasPieceBounds ? Math.max(maxX, boardMaxX) : boardMaxX;
        const fitMaxY = hasPieceBounds ? Math.max(maxY, boardMaxY) : boardMaxY;

        fitCameraToBounds(fitMinX, fitMinY, fitMaxX, fitMaxY);
      }

      // Build Spatial Hash
      spatialHashRef.current.clear();
      Object.values(gameStateRef.current!.pieces).forEach(p => {
        if (!p.inTray) spatialHashRef.current.insert(p);
      });
      
      setIsLoading(false);
    };

    initGame();

    // Start Loop
    animationFrameRef.current = requestAnimationFrame(loop);

    // Resize handler
    const handleResize = () => {
      if (canvasRef.current && rendererRef.current) {
        rendererRef.current.resize(window.innerWidth, window.innerHeight);
      }
      setTrayHeight(Math.max(160, Math.min(220, Math.round(window.innerHeight * 0.22))));
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      el.removeEventListener('pointerdown', unlockOnce);
      if (animationFrameRef.current !== undefined) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      // Reset initialization flag on cleanup so remounting works correctly
      initializedRef.current = false;
      trayInitRef.current = false;
    };
  }, []);

  // Helper to check snap between two pieces
  const checkSnap = (p1: Piece, others: Piece[], tolerance: number) => {
    for (const p2 of others) {
      // Find neighbor definition
      const neighbor = p1.neighbors.find(n => n.otherId === p2.id);
      
      if (neighbor) {
        // Calculate target pose for p1 based on p2
        // p1 should be at p2 + deltaPose (rotated)
        // Wait, deltaPose is "Expected relative pose of otherId relative to this piece"
        // So p2_expected = p1 + deltaPose
        // So p1_expected = p2 - deltaPose
        
        // Let's verify deltaPose definition in classicGrid.ts
        // neighbors.push({ otherId: ..., deltaPose: { x: 0, y: -pieceHeight } }) for Top neighbor
        // Top neighbor is at (x, y-h). p1 is at (x, y).
        // So deltaPose is (0, -h).
        // p2 = p1 + deltaPose. Correct.
        
        // So if we want to snap p1 TO p2:
        // p1 = p2 - deltaPose.
        
        // Rotation is disabled, so use the unrotated relative offset.
        const relX = p1.correctPose.x - p2.correctPose.x;
        const relY = p1.correctPose.y - p2.correctPose.y;

        const targetX = p2.currentPose.x + relX;
        const targetY = p2.currentPose.y + relY;

        const dist = Math.sqrt(Math.pow(p1.currentPose.x - targetX, 2) + Math.pow(p1.currentPose.y - targetY, 2));
        if (dist < tolerance) {
          return { 
            snapped: true, 
            targetPose: { 
              x: targetX, 
              y: targetY, 
              rotation: 0 
            }, 
            targetPieceId: p2.id 
          };
        }
      }
    }
    return { snapped: false };
  };

  const findBestSnap = (
    p1: Piece,
    others: Piece[],
    tolerance: number,
    poseOverride?: { x: number; y: number; rotation: number }
  ) => {
    const otherMap = new Map(others.map(p => [p.id, p]));
    const pose = poseOverride ?? p1.currentPose;
    let best: { targetPose: { x: number; y: number; rotation: number }; targetPieceId: string; distance: number } | null = null;

    for (const neighbor of p1.neighbors) {
      const p2 = otherMap.get(neighbor.otherId);
      if (!p2) continue;
      const targetX = p2.currentPose.x - neighbor.deltaPose.x;
      const targetY = p2.currentPose.y - neighbor.deltaPose.y;
      const dist = Math.hypot(pose.x - targetX, pose.y - targetY);
      if (dist < tolerance && (!best || dist < best.distance)) {
        best = {
          targetPose: { x: targetX, y: targetY, rotation: 0 },
          targetPieceId: p2.id,
          distance: dist
        };
      }
    }

    return best;
  };


  // --- UNIFIED COMPLETION TRIGGER ---
  const handlePuzzleComplete = () => {
    if (!gameStateRef.current || gameStateRef.current.isComplete) return;

    // 1. Set State
    gameStateRef.current.isComplete = true;
    setIsComplete(true); // Local state for UI if needed
    setShowCompletionModal(true);

    // 2. Play Effects
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
    if (soundEnabled) playCelebrationSfx(0.8);

    // 3. Auto-center/Polish
    const pieces = Object.values(gameStateRef.current.pieces);
    pieces.forEach(p => {
      p.currentPose = { ...p.correctPose };
      p.isLocked = true;
      p.inTray = false;
    });
  };

  // --- COMPLETION CHECKER ---
  const checkForCompletion = () => {
    if (!gameStateRef.current || !unionFindRef.current) return;
    if (gameStateRef.current.isComplete) return;

    const pieces = Object.values(gameStateRef.current.pieces);
    if (pieces.length === 0) return;

    // Method 1: UnionFind Connectivity
    const rootId = unionFindRef.current.find(pieces[0].id);
    const allConnected = pieces.every(p => unionFindRef.current!.find(p.id) === rootId);

    // Method 2: Positional Correctness
    let allCorrect = true;
    for (const p of pieces) {
      const dx = Math.abs(p.currentPose.x - p.correctPose.x);
      const dy = Math.abs(p.currentPose.y - p.correctPose.y);
      if (dx > 5 || dy > 5) {
        allCorrect = false;
        break;
      }
    }

    if (allConnected || allCorrect) {
      handlePuzzleComplete();
    }
  };

  // Local state wrapper for isComplete
  const [isComplete, setIsComplete] = useState(false);

  // Game Loop with drag smoothing
  const loop = () => {
    if (!gameStateRef.current || !rendererRef.current) return;
    
    // Apply drag smoothing if actively dragging
    if (draggingRef.current && draggingRef.current.targetPositions) {
      const elapsed = Date.now() - draggingRef.current.startTime;
      const alpha = elapsed < fastPhaseMs ? fastAlpha : smoothingAlpha;
      
      Object.entries(draggingRef.current.targetPositions).forEach(([id, target]) => {
        const piece = gameStateRef.current!.pieces[id];
        const current = piece.currentPose;
        
        // Smooth interpolation with two-phase alpha
        const dx = target.x - current.x;
        const dy = target.y - current.y;
        
        current.x += dx * alpha;
        current.y += dy * alpha;
      });
    }
    
    rendererRef.current.render(gameStateRef.current, cameraRef.current, draggingRef.current?.pieceId);
    animationFrameRef.current = requestAnimationFrame(loop);
  };

  // Timer
  useEffect(() => {
    const interval = setInterval(() => {
      if (gameStateRef.current && !gameStateRef.current.isComplete) {
        gameStateRef.current.elapsedTime += 1;
        setElapsedTime(gameStateRef.current.elapsedTime);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleDrag = ({ delta: [dx, dy], first, last, xy: [x, y], event }: any) => {
    if (!gameStateRef.current || !cameraRef.current) return;

    let rawX = x;
    let rawY = y;
    if (trayDragRef.current && trayGrabOffsetRef.current) {
      rawX -= trayGrabOffsetRef.current.x;
      rawY -= trayGrabOffsetRef.current.y;
    }
    const clampedY = trayDragRef.current ? clampClientYToTray(rawY) : rawY;
    const worldPos = cameraRef.current.screenToWorld(rawX, clampedY);

    if (first) {
      let hitPiece: Piece | null = null;
      const forcedId = forcedDragPieceIdRef.current;
      if (forcedId) {
        hitPiece = gameStateRef.current.pieces[forcedId] || null;
        forcedDragPieceIdRef.current = null;
      } else {
        const pieces = Object.values(gameStateRef.current.pieces)
          .filter(p => !p.inTray)
          .sort((a, b) => b.zIndex - a.zIndex);

        const pieceWidth = config.image.width / config.cols;
        const pieceHeight = config.image.height / config.rows;
        const hitRadius = Math.min(pieceWidth, pieceHeight) * 0.65;

        for (const p of pieces) {
          if (p.isLocked) continue;
          const dist = Math.sqrt(Math.pow(worldPos.x - p.currentPose.x, 2) + Math.pow(worldPos.y - p.currentPose.y, 2));
          if (dist < hitRadius) {
            hitPiece = p;
            break;
          }
        }
      }

      if (hitPiece) {
        const rootId = unionFindRef.current!.find(hitPiece.id);
        const groupIds: string[] = [];
        Object.values(gameStateRef.current.pieces).forEach(p => {
          if (p.inTray) return;
          if (unionFindRef.current!.find(p.id) === rootId) {
            groupIds.push(p.id);
          }
        });

        const maxZ = Math.max(...Object.values(gameStateRef.current.pieces).map(p => p.zIndex));
        groupIds.forEach(id => {
          gameStateRef.current!.pieces[id].zIndex = maxZ + 1;
        });

        const offsets: Record<string, Point> = {};
        const targetPositions: Record<string, Point> = {};
        groupIds.forEach(id => {
          const p = gameStateRef.current!.pieces[id];
          offsets[id] = {
            x: p.currentPose.x - worldPos.x,
            y: p.currentPose.y - worldPos.y
          };
          targetPositions[id] = { x: p.currentPose.x, y: p.currentPose.y };
        });

        draggingRef.current = {
          pieceId: hitPiece.id,
          startScreenPos: { x, y },
          startPiecePos: { ...hitPiece.currentPose },
          groupOffsets: offsets,
          targetPositions: targetPositions,
          startTime: Date.now()
        };

        if (event && 'pointerId' in event) {
          const target = event.target;
          if (target && 'setPointerCapture' in target) {
            (target as Element).setPointerCapture(event.pointerId);
          }
        }
      } else {
        cameraRef.current.pan(dx, dy);
      }
    } else if (draggingRef.current) {
      Object.entries(draggingRef.current.groupOffsets).forEach(([id, offset]) => {
        draggingRef.current!.targetPositions[id] = {
          x: worldPos.x + offset.x,
          y: worldPos.y + offset.y
        };
      });

      const anchorId = draggingRef.current.pieceId;
      const anchorPiece = gameStateRef.current.pieces[anchorId];
      const anchorTarget = draggingRef.current.targetPositions[anchorId];
      if (anchorPiece && anchorTarget) {
        const pieceWidth = config.image.width / config.cols;
        const pieceHeight = config.image.height / config.rows;
        const minDim = Math.min(pieceWidth, pieceHeight);
        const snapDistScreenPx = 36;
        const snapDistWorld = snapDistScreenPx / cameraRef.current.zoom;
        const snapTolerance = Math.min(Math.max(minDim * 0.08, snapDistWorld), minDim * 0.22);
        const hysteresis = 1.35;

        const otherPieces = Object.values(gameStateRef.current.pieces).filter(
          p => !p.inTray && unionFindRef.current!.find(p.id) !== unionFindRef.current!.find(anchorId)
        );

        const currentPose = {
          x: anchorTarget.x,
          y: anchorTarget.y,
          rotation: 0
        };

        if (snapAssistRef.current && snapAssistRef.current.anchorId === anchorId) {
          const dist = Math.hypot(
            currentPose.x - snapAssistRef.current.targetPose.x,
            currentPose.y - snapAssistRef.current.targetPose.y
          );
          if (dist > snapTolerance * hysteresis) {
            snapAssistRef.current = null;
          }
        }

        if (!snapAssistRef.current) {
          const best = findBestSnap(anchorPiece, otherPieces, snapTolerance, currentPose);
          if (best) {
            snapAssistRef.current = { anchorId, targetPose: best.targetPose };
          }
        }

        if (snapAssistRef.current) {
          const dx = snapAssistRef.current.targetPose.x - currentPose.x;
          const dy = snapAssistRef.current.targetPose.y - currentPose.y;
          Object.keys(draggingRef.current.targetPositions).forEach(id => {
            draggingRef.current!.targetPositions[id].x += dx;
            draggingRef.current!.targetPositions[id].y += dy;
          });
        }
      }
    } else {
      cameraRef.current.pan(dx, dy);
    }

    if (last && draggingRef.current) {
      Object.entries(draggingRef.current.targetPositions).forEach(([id, target]) => {
        const piece = gameStateRef.current!.pieces[id];
        piece.currentPose.x = target.x;
        piece.currentPose.y = target.y;
      });

      const draggedIds = Object.keys(draggingRef.current.groupOffsets);
      if (isPointInTray(x, y) && draggedIds.length === 1) {
        const piece = gameStateRef.current!.pieces[draggedIds[0]];
        if (piece && !piece.isLocked) {
          piece.inTray = true;
          setTrayIds(ids => (ids.includes(piece.id) ? ids : [...ids, piece.id]));
          spatialHashRef.current.clear();
          Object.values(gameStateRef.current.pieces).forEach(p => {
            if (!p.inTray) spatialHashRef.current.insert(p);
          });
          draggingRef.current = null;
          return;
        }
      }

      snapAssistRef.current = null;

      const draggedId = draggingRef.current.pieceId;
      const rootId = unionFindRef.current!.find(draggedId);
      
      const groupPieces = Object.values(gameStateRef.current.pieces).filter(
        p => !p.inTray && unionFindRef.current!.find(p.id) === rootId
      );

      const pieceWidth = config.image.width / config.cols;
      const pieceHeight = config.image.height / config.rows;
      const minDim = Math.min(pieceWidth, pieceHeight);
      const snapDistScreenPx = 36;
      const snapDistWorld = snapDistScreenPx / cameraRef.current.zoom;
      const snapTolerance = Math.min(Math.max(minDim * 0.08, snapDistWorld), minDim * 0.22);

      let snapped = false;

      // 1. Board Snap
      for (const p of groupPieces) {
        if (!p.border) continue;

        let dx = 0;
        let dy = 0;
        let snappedToBoard = false;

        if (p.border.top) {
          const dist = Math.abs(p.currentPose.y - p.correctPose.y);
          if (dist < snapTolerance) {
            dy = p.correctPose.y - p.currentPose.y;
            snappedToBoard = true;
          }
        }
        if (p.border.bottom) {
          const dist = Math.abs(p.currentPose.y - p.correctPose.y);
          if (dist < snapTolerance) {
            dy = p.correctPose.y - p.currentPose.y;
            snappedToBoard = true;
          }
        }
        if (p.border.left) {
          const dist = Math.abs(p.currentPose.x - p.correctPose.x);
          if (dist < snapTolerance) {
            dx = p.correctPose.x - p.currentPose.x;
            snappedToBoard = true;
          }
        }
        if (p.border.right) {
          const dist = Math.abs(p.currentPose.x - p.correctPose.x);
          if (dist < snapTolerance) {
            dx = p.correctPose.x - p.currentPose.x;
            snappedToBoard = true;
          }
        }

          if (snappedToBoard) {
            groupPieces.forEach(gp => {
              gp.currentPose.x += dx;
              gp.currentPose.y += dy;
              gp.currentPose.rotation = 0;
            });

          if (rendererRef.current) {
            rendererRef.current.triggerSnapGlowGroup(groupPieces.map(gp => gp.id));
          }

          if (soundEnabled) playPlacementSfx(0.7);
          snapped = true;
          break;
        }
      }

      // 2. Piece Snap
      const otherPieces = Object.values(gameStateRef.current.pieces).filter(
        p => !p.inTray && unionFindRef.current!.find(p.id) !== rootId
      );

      const effectiveTolerance = snapped ? 5 : snapTolerance;

      for (const p of groupPieces) {
        for (const other of otherPieces) {
          if (unionFindRef.current!.find(p.id) === unionFindRef.current!.find(other.id)) continue;

             const result = checkSnap(p, [other], effectiveTolerance);

          if (result.snapped && result.targetPieceId) {
            if (!snapped) {
              const dx = result.targetPose!.x - p.currentPose.x;
              const dy = result.targetPose!.y - p.currentPose.y;

              groupPieces.forEach(gp => {
                gp.currentPose.x += dx;
                gp.currentPose.y += dy;
                gp.currentPose.rotation = 0;
              });

              if (rendererRef.current) {
                rendererRef.current.triggerSnapGlow(p.id);
                rendererRef.current.triggerSnapGlow(result.targetPieceId!);
              }

              if (soundEnabled) playPlacementSfx(0.7);
              snapped = true;
            }

            unionFindRef.current!.union(p.id, result.targetPieceId);
          }
        }
      }

      if (snapped) {
        setMoveCount(c => c + 1);
        gameStateRef.current.moveCount++;
        checkForCompletion();
      }

      spatialHashRef.current.clear();
      Object.values(gameStateRef.current.pieces).forEach(p => {
        if (!p.inTray) spatialHashRef.current.insert(p);
      });

      draggingRef.current = null;
    }
  };

  const handleTrayPointerDown = (pieceId: string, event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!gameStateRef.current || !cameraRef.current) return;

    const piece = gameStateRef.current.pieces[pieceId];
    if (!piece || piece.isLocked) return;

    if (event.currentTarget && 'setPointerCapture' in event.currentTarget) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    piece.inTray = false;
    setTrayIds(ids => ids.filter(id => id !== pieceId));

    const maxZ = Math.max(...Object.values(gameStateRef.current.pieces).map(p => p.zIndex));
    piece.zIndex = maxZ + 1;

    const rect = event.currentTarget.getBoundingClientRect();
    const offsetX = event.clientX - (rect.left + rect.width / 2);
    const offsetY = event.clientY - (rect.top + rect.height / 2);
    trayGrabOffsetRef.current = { x: offsetX, y: offsetY };

    const clampedY = clampClientYToTray(event.clientY - offsetY);
    const worldPos = cameraRef.current.screenToWorld(event.clientX - offsetX, clampedY);
    piece.currentPose.x = worldPos.x;
    piece.currentPose.y = worldPos.y;

    forcedDragPieceIdRef.current = pieceId;
    trayDragRef.current = {
      id: pieceId,
      lastX: event.clientX - offsetX,
      lastY: event.clientY - offsetY,
      pointerId: event.pointerId
    };

    handleDrag({
      delta: [0, 0],
      first: true,
      last: false,
      xy: [event.clientX, event.clientY],
      event: event.nativeEvent
    });

    const handleMove = (moveEvent: PointerEvent) => {
      if (!trayDragRef.current || moveEvent.pointerId !== trayDragRef.current.pointerId) return;
      const offset = trayGrabOffsetRef.current || { x: 0, y: 0 };
      const clientX = moveEvent.clientX - offset.x;
      const clientY = moveEvent.clientY - offset.y;
      const dx = clientX - trayDragRef.current.lastX;
      const dy = clientY - trayDragRef.current.lastY;
      trayDragRef.current.lastX = clientX;
      trayDragRef.current.lastY = clientY;
      handleDrag({
        delta: [dx, dy],
        first: false,
        last: false,
        xy: [moveEvent.clientX, moveEvent.clientY],
        event: moveEvent
      });
    };

    const handleUp = (upEvent: PointerEvent) => {
      if (!trayDragRef.current || upEvent.pointerId !== trayDragRef.current.pointerId) return;
      const offset = trayGrabOffsetRef.current || { x: 0, y: 0 };
      const clientX = upEvent.clientX - offset.x;
      const clientY = upEvent.clientY - offset.y;
      const dx = clientX - trayDragRef.current.lastX;
      const dy = clientY - trayDragRef.current.lastY;
      handleDrag({
        delta: [dx, dy],
        first: false,
        last: true,
        xy: [upEvent.clientX, upEvent.clientY],
        event: upEvent
      });
      trayDragRef.current = null;
      trayGrabOffsetRef.current = null;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const bind = useGesture({
    onDrag: handleDrag,
    onWheel: ({ delta: [, dy] }) => {
      cameraRef.current.setZoom(cameraRef.current.zoom * (1 - dy / 1000));
    },
    onPinch: ({ offset: [d] }) => {
      cameraRef.current.setZoom(1 + d / 200);
    }
  }, {
    target: canvasRef,
    eventOptions: { passive: false }
  });

  const trayItemSize = Math.max(64, Math.min(96, trayHeight - 64));
  const trayScrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const trayPieces = trayIds
    .map(id => gameStateRef.current?.pieces[id])
    .filter((p): p is Piece => Boolean(p && p.inTray));

  const updateTrayScrollState = () => {
    const el = trayScrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft < maxScroll - 1);
  };

  useEffect(() => {
    updateTrayScrollState();
  }, [trayPieces.length, trayHeight]);

  useEffect(() => {
    const el = trayScrollRef.current;
    if (!el) return;
    const onScroll = () => updateTrayScrollState();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', updateTrayScrollState);
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', updateTrayScrollState);
    };
  }, []);

  const scrollTrayBy = (direction: 'left' | 'right') => {
    const el = trayScrollRef.current;
    if (!el) return;
    const amount = Math.max(240, Math.floor(el.clientWidth * 0.75));
    const delta = direction === 'left' ? -amount : amount;
    el.scrollBy({ left: delta, behavior: 'smooth' });
  };

  const handleAutoSolve = () => {
    if (!gameStateRef.current) return;
    Object.values(gameStateRef.current.pieces).forEach(p => {
      p.currentPose = { ...p.correctPose };
      p.isLocked = true;
    });
    const root = Object.keys(gameStateRef.current.pieces)[0];
    Object.keys(gameStateRef.current.pieces).forEach(id => {
      unionFindRef.current!.union(root, id);
    });

    handlePuzzleComplete();
  };

  const handleShuffle = () => {
    if (!gameStateRef.current) return;
    const nextSeed = shuffleSeed + 1;
    const rng = generateSeed(config.seed + nextSeed);
    const boardW = config.image.width * 1.5;
    const boardH = config.image.height * 1.5;
    const trayTop = getTrayRect().top;
    const maxBoardY = cameraRef.current.screenToWorld(0, trayTop - 12).y;
    const minBoardY = cameraRef.current.screenToWorld(0, 0).y;
    const minBoardX = cameraRef.current.screenToWorld(0, 0).x;
    const maxBoardX = cameraRef.current.screenToWorld(window.innerWidth, 0).x;

    const groups = new Map<string, Piece[]>();
    Object.values(gameStateRef.current.pieces).forEach(p => {
      if (p.inTray) return;
      const root = unionFindRef.current!.find(p.id);
      const list = groups.get(root);
      if (list) list.push(p);
      else groups.set(root, [p]);
    });

    const randomWorldX = () => minBoardX + rng() * (maxBoardX - minBoardX);
    const randomWorldY = () => minBoardY + rng() * (maxBoardY - minBoardY);

    groups.forEach(pieces => {
      const unlockedPieces = pieces.filter(p => !p.isLocked);
      if (unlockedPieces.length === 0) return;
      if (pieces.length >= 4) return;

      if (pieces.length === 1) {
        const p = pieces[0];
        if (p.isLocked) return;
        p.currentPose.x = (rng() - 0.5) * boardW + config.image.width / 2;
        p.currentPose.y = (rng() - 0.5) * boardH + config.image.height / 2;
        if (p.currentPose.y > maxBoardY) p.currentPose.y = maxBoardY;
        if (p.currentPose.y < minBoardY) p.currentPose.y = minBoardY;
        if (p.currentPose.x < minBoardX) p.currentPose.x = minBoardX;
        if (p.currentPose.x > maxBoardX) p.currentPose.x = maxBoardX;
        p.currentPose.rotation = 0;
        return;
      }

      if (pieces.length <= 3) {
        if (pieces.some(p => p.isLocked)) return;
        const cx = pieces.reduce((acc, p) => acc + p.currentPose.x, 0) / pieces.length;
        const cy = pieces.reduce((acc, p) => acc + p.currentPose.y, 0) / pieces.length;
        let targetX = randomWorldX();
        let targetY = randomWorldY();
        if (targetY > maxBoardY) targetY = maxBoardY;
        if (targetY < minBoardY) targetY = minBoardY;
        const dx = targetX - cx;
        const dy = targetY - cy;
        pieces.forEach(p => {
          p.currentPose.x += dx;
          p.currentPose.y += dy;
        });
      }
    });

    setShuffleSeed(nextSeed);
    setTrayIds(ids => {
      const next = [...ids];
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      return next;
    });
    spatialHashRef.current.clear();
    Object.values(gameStateRef.current.pieces).forEach(p => {
      if (!p.inTray) spatialHashRef.current.insert(p);
    });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center w-full h-full text-white">Loading Puzzle...</div>;
  }

  return (
    <div 
      className="relative w-full h-full overflow-hidden transition-colors duration-500"
      style={bgStyles[background]}
    >
      <canvas
        ref={canvasRef}
        className="block touch-none w-full h-full"
        onContextMenu={(e) => e.preventDefault()}
      />

      {debugMode && gameStateRef.current && (
        <DebugOverlay 
          gameState={gameStateRef.current} 
          camera={cameraRef.current} 
          width={window.innerWidth} 
          height={window.innerHeight} 
        />
      )}

      <div className="absolute top-4 left-4 z-30 flex items-center gap-2">
        <button
          className="h-11 w-11 bg-transparent text-black touch-none select-none grid place-items-center opacity-80 hover:opacity-100 active:opacity-70"
          onClick={() => setShowSettings(true)}
          aria-label="Open settings"
          type="button"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
        <button
          className="h-11 w-11 bg-transparent text-black touch-none select-none grid place-items-center opacity-80 hover:opacity-100 active:opacity-70"
          onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
          onClick={(event) => { event.stopPropagation(); handleShuffle(); }}
          aria-label="Shuffle"
          type="button"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 3h5v5"></path>
            <path d="M4 20l6-6"></path>
            <path d="M21 3l-7 7"></path>
            <path d="M4 4l6 6"></path>
            <path d="M16 21h5v-5"></path>
            <path d="M14 14l7 7"></path>
          </svg>
        </button>
        <button
          className="h-11 w-11 bg-transparent text-black touch-none select-none grid place-items-center opacity-80 hover:opacity-100 active:opacity-70"
          onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
          onClick={(event) => { event.stopPropagation(); handleAutoSolve(); }}
          aria-label="Auto solve"
          type="button"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"></path>
          </svg>
        </button>
      </div>

      {showSettings && (
        <div className="absolute inset-0 z-40 flex items-center justify-center">
          <button
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowSettings(false)}
            aria-label="Close settings"
            type="button"
          />
          <div className="relative z-10 w-[min(92vw,420px)] max-h-[85vh] overflow-y-auto rounded-2xl border border-white/30 bg-white/90 p-5 shadow-[0_20px_40px_rgba(0,0,0,0.35)]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-bold">Settings</h2>
              <button
                className="h-9 w-9 rounded-full border border-black/20 bg-white/70"
                onClick={() => setShowSettings(false)}
                aria-label="Close settings"
                type="button"
              >
                ✕
              </button>
            </div>

            <div className="text-sm font-mono mb-4">
              <div>Time: {Math.floor(elapsedTime / 60)}:{String(elapsedTime % 60).padStart(2, '0')}</div>
              <div>Moves: {moveCount}</div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase">Background</label>
                <div className="flex gap-1">
                  {['felt', 'dark', 'wood', 'blue'].map(bg => (
                    <button
                      key={bg}
                      onClick={() => setBackground(bg as any)}
                      className={`flex-1 h-8 border-2 border-black ${background === bg ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                      style={bgStyles[bg as keyof typeof bgStyles]}
                      title={bg}
                    />
                  ))}
                </div>
              </div>

              <button 
                className={`w-full px-3 py-2 text-sm border-2 border-black font-bold uppercase flex justify-between items-center ${soundEnabled ? 'bg-white hover:bg-gray-100' : 'bg-gray-300 text-gray-500'}`}
                onClick={() => {
                  const newState = !soundEnabled;
                  setSoundEnabled(newState);
                  audioManager.setEnabled(newState);
                }}
              >
                <span>Sound</span>
                <span>{soundEnabled ? 'ON' : 'OFF'}</span>
              </button>

              <button 
                className={`w-full px-3 py-2 text-sm border-2 border-black font-bold uppercase flex justify-between items-center ${showGhost ? 'bg-primary text-white' : 'bg-white hover:bg-gray-100'}`}
                onClick={() => setShowGhost(!showGhost)}
              >
                <span>Ghost Image</span>
                <span>{showGhost ? 'ON' : 'OFF'}</span>
              </button>

              <button 
                className="neo-btn w-full px-3 py-2 text-sm bg-green-400 hover:bg-green-500"
                onClick={handleAutoSolve}
              >
                Auto Solve
              </button>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button className="neo-btn px-3 py-2 text-sm" onClick={onExit}>Exit</button>
                <button className="neo-btn-secondary px-3 py-2 text-sm" onClick={() => {
                   if (canvasRef.current && gameStateRef.current) {
                     canvasRef.current.toBlob(blob => {
                       gameStateRef.current!.pan = {
                         x: cameraRef.current.x,
                         y: cameraRef.current.y
                       };
                       gameStateRef.current!.scale = cameraRef.current.zoom;
                       if (blob) onSave(gameStateRef.current!, blob);
                     });
                   }
                }}>Save</button>
                
                <button 
                  className="neo-btn px-3 py-2 text-sm bg-yellow-400 hover:bg-yellow-500 col-span-2"
                  onClick={handleShuffle}
                >
                  Shuffle
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-auto">
        <div
          ref={trayRef}
          className="border border-white/30 bg-gradient-to-b from-white/20 to-white/10 shadow-[0_-12px_24px_rgba(0,0,0,0.18)] rounded-t-2xl touch-none select-none"
          style={{
            height: trayHeight,
            backdropFilter: 'blur(1px)',
            WebkitBackdropFilter: 'blur(1px)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 -12px 24px rgba(0,0,0,0.18)'
          }}
        >
          <div className="h-full px-3 py-3">
            <div className="flex items-center justify-between mb-2">
              <span
                className="text-lg"
                style={{
                  fontFamily: '"Brush Script MT","Segoe Script","Snell Roundhand","Lucida Handwriting",cursive',
                  fontWeight: 800,
                  textShadow: '0 1px 2px rgba(0,0,0,0.35)'
                }}
              >
                Piece Bank
              </span>
              <span>{trayPieces.length}</span>
            </div>
            <div className="relative">
              <button
                type="button"
                className={`absolute left-1 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full border border-white/30 bg-white/15 text-black shadow-[0_6px_14px_rgba(0,0,0,0.18)] transition-opacity duration-200 ${canScrollLeft ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
                onClick={(event) => { event.stopPropagation(); scrollTrayBy('left'); }}
                aria-label="Scroll piece bank left"
              >
                ‹
              </button>
              <button
                type="button"
                className={`absolute right-1 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full border border-white/30 bg-white/15 text-black shadow-[0_6px_14px_rgba(0,0,0,0.18)] transition-opacity duration-200 ${canScrollRight ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
                onClick={(event) => { event.stopPropagation(); scrollTrayBy('right'); }}
                aria-label="Scroll piece bank right"
              >
                ›
              </button>
              <div
                ref={trayScrollRef}
                className="flex gap-3 overflow-x-auto pb-2 px-12 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              >
                {trayPieces.length === 0 ? (
                  <div className="text-xs font-mono text-gray-500">Tray empty</div>
                ) : (
                  trayPieces.map(piece => (
                    <TrayPiece
                      key={piece.id}
                      piece={piece}
                      image={config.image}
                      size={trayItemSize}
                      onPointerDown={handleTrayPointerDown}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showCompletionModal && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="neo-card p-8 bg-white text-center animate-bounce-in">
            <h1 className="text-4xl font-bold mb-4 text-primary">PUZZLE COMPLETE!</h1>
            <div className="text-2xl font-mono mb-6">
              Time: {Math.floor(elapsedTime / 60)}:{String(elapsedTime % 60).padStart(2, '0')}
            </div>
            <div className="flex gap-4 justify-center">
              <button 
                className="neo-btn px-6 py-3 text-lg"
                onClick={onExit}
              >
                Back to Menu
              </button>
              <button 
                className="neo-btn-secondary px-6 py-3 text-lg"
                onClick={() => setShowCompletionModal(false)}
              >
                Stay Here
              </button>
            </div>
          </div>
        </div>
      )}

      {showGhost && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-30 z-0">
           <img 
             src={config.image.src} 
             style={{ 
               width: config.image.width * cameraRef.current.zoom, 
               height: config.image.height * cameraRef.current.zoom,
               transform: `translate(${-cameraRef.current.x * cameraRef.current.zoom}px, ${-cameraRef.current.y * cameraRef.current.zoom}px)`
             }} 
           />
        </div>
      )}
    </div>
  );
};
