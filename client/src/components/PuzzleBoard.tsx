import React, { useRef, useEffect, useState } from 'react';
import { useGesture } from '@use-gesture/react';
import confetti from 'canvas-confetti';
import { CanvasRenderer as PuzzleRenderer } from '../render/canvasRenderer';
import { Camera } from '../render/camera';
import { PuzzleGenerator } from '../engine/generator';
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
  const sfxUnlockedRef = useRef(false);

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
      if (initialState) {
        gameStateRef.current = initialState;
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
      } else {
        const generator = new PuzzleGenerator();
        gameStateRef.current = await generator.generate(config);
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
          p.currentPose.x = (Math.random() - 0.5) * boardW + config.image.width/2;
          p.currentPose.y = (Math.random() - 0.5) * boardH + config.image.height/2;
          if (config.rotationEnabled) {
            p.currentPose.rotation = Math.floor(Math.random() * 4) * (Math.PI / 2);
          }
        });
        
        // Calculate bounding box of all scattered pieces
        const pieces = Object.values(gameStateRef.current.pieces);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of pieces) {
          // Estimate piece bounds (use centroid +/- half piece size)
          const halfW = config.image.width / config.cols / 2 + 30; // Add padding for tabs
          const halfH = config.image.height / config.rows / 2 + 30;
          minX = Math.min(minX, p.currentPose.x - halfW);
          minY = Math.min(minY, p.currentPose.y - halfH);
          maxX = Math.max(maxX, p.currentPose.x + halfW);
          maxY = Math.max(maxY, p.currentPose.y + halfH);
        }
        
        // Add margin around the bounding box
        const margin = 50;
        minX -= margin;
        minY -= margin;
        maxX += margin;
        maxY += margin;
        
        // Calculate zoom to fit all pieces on screen
        const boundsW = maxX - minX;
        const boundsH = maxY - minY;
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;
        const zoomToFitW = screenW / boundsW;
        const zoomToFitH = screenH / boundsH;
        const initialZoom = Math.min(zoomToFitW, zoomToFitH, 1); // Cap at 1x to avoid zooming in too much
        
        // Center camera on the middle of scattered pieces
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        cameraRef.current.zoom = Math.max(0.2, initialZoom); // Ensure minimum zoom
        cameraRef.current.x = centerX - screenW / 2 / cameraRef.current.zoom;
        cameraRef.current.y = centerY - screenH / 2 / cameraRef.current.zoom;
      }

      // Build Spatial Hash
      spatialHashRef.current.clear();
      Object.values(gameStateRef.current!.pieces).forEach(p => spatialHashRef.current.insert(p));
      
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
        
        // We need to rotate deltaPose by p2's rotation
        const cos = Math.cos(p2.currentPose.rotation);
        const sin = Math.sin(p2.currentPose.rotation);
        
        // deltaPose is in p1's local space? No, it's usually axis aligned.
        // If p1 is rotated, deltaPose rotates with it?
        // Actually, let's stick to the simpler logic:
        // They should have the same relative offset as in correctPose.
        
        const relX = p1.correctPose.x - p2.correctPose.x;
        const relY = p1.correctPose.y - p2.correctPose.y;
        
        // Rotate relative offset by p2's rotation
        const rotX = relX * cos - relY * sin;
        const rotY = relX * sin + relY * cos;

        const targetX = p2.currentPose.x + rotX;
        const targetY = p2.currentPose.y + rotY;
        const targetRot = p2.currentPose.rotation;

        const dist = Math.sqrt(Math.pow(p1.currentPose.x - targetX, 2) + Math.pow(p1.currentPose.y - targetY, 2));
        const rotDiff = Math.abs(p1.currentPose.rotation - targetRot);
        
        // Allow snap if distance is small AND rotation is close (or rotation disabled)
        if (dist < tolerance && (rotDiff < 0.2 || rotDiff > Math.PI * 2 - 0.2)) {
          // Round to nearest pixel to prevent subpixel gaps
          return { 
            snapped: true, 
            targetPose: { 
              x: targetX, 
              y: targetY, 
              rotation: targetRot 
            }, 
            targetPieceId: p2.id 
          };
        }
      }
    }
    return { snapped: false };
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

  // Gestures
  const bind = useGesture({
    onDrag: ({ delta: [dx, dy], first, last, xy: [x, y], event }) => {
      if (!gameStateRef.current || !cameraRef.current) return;
      
      const worldPos = cameraRef.current.screenToWorld(x, y);

      if (first) {
        // Hit test
        const pieces = Object.values(gameStateRef.current.pieces).sort((a, b) => b.zIndex - a.zIndex);
        let hitPiece: Piece | null = null;
        
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

        if (hitPiece) {
          const rootId = unionFindRef.current!.find(hitPiece.id);
          const groupIds: string[] = [];
          Object.values(gameStateRef.current.pieces).forEach(p => {
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
            // Initialize target positions to current positions (no initial jump)
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
          
          // Enable pointer capture for smoother dragging
          if (event?.target && 'setPointerCapture' in event.target && event.pointerId !== undefined) {
            (event.target as Element).setPointerCapture(event.pointerId);
          }
        } else {
          cameraRef.current.pan(dx, dy);
        }
      } else if (draggingRef.current) {
        // Update target positions for smooth interpolation
        Object.entries(draggingRef.current.groupOffsets).forEach(([id, offset]) => {
          draggingRef.current!.targetPositions[id] = {
            x: worldPos.x + offset.x,
            y: worldPos.y + offset.y
          };
        });
      } else {
        cameraRef.current.pan(dx, dy);
      }

      if (last && draggingRef.current) {
        // First, snap pieces to final target positions (no more smoothing drift)
        Object.entries(draggingRef.current.targetPositions).forEach(([id, target]) => {
          const piece = gameStateRef.current!.pieces[id];
          piece.currentPose.x = target.x;
          piece.currentPose.y = target.y;
        });
        
        const draggedId = draggingRef.current.pieceId;
        const rootId = unionFindRef.current!.find(draggedId);
        
        const groupPieces = Object.values(gameStateRef.current.pieces).filter(
          p => unionFindRef.current!.find(p.id) === rootId
        );

        const pieceWidth = config.image.width / config.cols;
        const pieceHeight = config.image.height / config.rows;
        const minDim = Math.min(pieceWidth, pieceHeight);
        const snapTolerance = Math.max(12, Math.min(40, minDim * 0.12));

        let snapped = false;
        
        // 1. Board Snap
        for (const p of groupPieces) {
          if (!p.border) continue;
          
          let dx = 0;
          let dy = 0;
          let snappedToBoard = false;
          
          if (p.border.top) {
            const dist = Math.abs(p.currentPose.y - p.correctPose.y);
            if (dist < snapTolerance && Math.abs(p.currentPose.rotation) < 0.1) {
              dy = p.correctPose.y - p.currentPose.y;
              snappedToBoard = true;
            }
          }
          if (p.border.bottom) {
             const dist = Math.abs(p.currentPose.y - p.correctPose.y);
             if (dist < snapTolerance && Math.abs(p.currentPose.rotation) < 0.1) {
               dy = p.correctPose.y - p.currentPose.y;
               snappedToBoard = true;
             }
          }
          if (p.border.left) {
            const dist = Math.abs(p.currentPose.x - p.correctPose.x);
            if (dist < snapTolerance && Math.abs(p.currentPose.rotation) < 0.1) {
              dx = p.correctPose.x - p.currentPose.x;
              snappedToBoard = true;
            }
          }
          if (p.border.right) {
            const dist = Math.abs(p.currentPose.x - p.correctPose.x);
            if (dist < snapTolerance && Math.abs(p.currentPose.rotation) < 0.1) {
              dx = p.correctPose.x - p.currentPose.x;
              snappedToBoard = true;
            }
          }
          
          if (snappedToBoard) {
            groupPieces.forEach(gp => {
              gp.currentPose.x += dx;
              gp.currentPose.y += dy;
              if (Math.abs(gp.currentPose.rotation) < 0.1) {
                gp.currentPose.rotation = 0;
              }
            });

            // Trigger blue glow effect on all pieces in the group
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
          p => unionFindRef.current!.find(p.id) !== rootId
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
                  const dRot = result.targetPose!.rotation - p.currentPose.rotation;

                  groupPieces.forEach(gp => {
                    gp.currentPose.x += dx;
                    gp.currentPose.y += dy;
                    gp.currentPose.rotation += dRot;
                  });

                  // Trigger blue glow effect on snapping pieces
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
        Object.values(gameStateRef.current.pieces).forEach(p => spatialHashRef.current.insert(p));

        draggingRef.current = null;
      }
    },

    onWheel: ({ delta: [, dy] }) => {
      cameraRef.current.setZoom(cameraRef.current.zoom * (1 - dy / 1000));
    },
    onPinch: ({ offset: [d], event }) => {
      cameraRef.current.setZoom(1 + d / 200);
    }
  }, {
    target: canvasRef,
    eventOptions: { passive: false }
  });

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
        onContextMenu={(e) => {
          e.preventDefault();
          if (!gameStateRef.current || !cameraRef.current || !config.rotationEnabled) return;

          const rect = canvasRef.current!.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          // Camera class expects screen coordinates relative to canvas?
          // Actually, standard Camera implementation usually assumes (0,0) is top-left of canvas.
          // Our x,y from useGesture are client coordinates?
          // useGesture xy is [clientX, clientY] usually? No, it's pageX/Y?
          // Let's check useGesture docs or assume it's relative to viewport.
          // We need to subtract canvas offset if canvas is not full screen.
          // But here canvas is full screen.
          const worldPos = cameraRef.current.screenToWorld(x, y);
          
          const pieces: Piece[] = Object.values(gameStateRef.current.pieces).sort((a, b) => b.zIndex - a.zIndex);
          let hitPiece: Piece | null = null;
          
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

          if (hitPiece) {
            const rootId = unionFindRef.current!.find(hitPiece.id);
            const groupIds: string[] = [];
            Object.values(gameStateRef.current.pieces).forEach(p => {
              if (unionFindRef.current!.find(p.id) === rootId) {
                groupIds.push(p.id);
              }
            });

            const center = hitPiece.currentPose;
            
            groupIds.forEach(id => {
              const p = gameStateRef.current!.pieces[id];
              const rx = p.currentPose.x - center.x;
              const ry = p.currentPose.y - center.y;
              
              p.currentPose.x = center.x - ry;
              p.currentPose.y = center.y + rx;
              p.currentPose.rotation = (p.currentPose.rotation + Math.PI/2) % (Math.PI * 2);
            });
          }
        }}
      />

      {debugMode && gameStateRef.current && (
        <DebugOverlay 
          gameState={gameStateRef.current} 
          camera={cameraRef.current} 
          width={window.innerWidth} 
          height={window.innerHeight} 
        />
      )}

      <div className="absolute top-4 left-4 flex flex-col gap-2 pointer-events-none">
        <div className="neo-card p-4 bg-white pointer-events-auto w-64">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-xl font-bold">ImaJig</h2>
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className={`p-1 border-2 border-black ${showSettings ? 'bg-primary text-white' : 'bg-white hover:bg-gray-100'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            </button>
          </div>
          
          <div className="text-sm font-mono mb-4">
            <div>Time: {Math.floor(elapsedTime / 60)}:{String(elapsedTime % 60).padStart(2, '0')}</div>
            <div>Moves: {moveCount}</div>
          </div>

          {showSettings ? (
            <div className="space-y-3 animate-fade-in">
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
                onClick={() => setDebugMode(!debugMode)} 
                className={`w-full px-3 py-2 text-sm border-2 border-black font-bold uppercase flex justify-between items-center ${debugMode ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'}`}
              >
                <span>Debug Mode</span>
                <span>{debugMode ? 'ON' : 'OFF'}</span>
              </button>
              
              <button 
                className="neo-btn w-full px-3 py-2 text-sm bg-green-400 hover:bg-green-500"
                onClick={() => {
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
                }}
              >
                Auto Solve
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button className="neo-btn px-3 py-2 text-sm" onClick={onExit}>Exit</button>
              <button className="neo-btn-secondary px-3 py-2 text-sm" onClick={() => {
                 if (canvasRef.current && gameStateRef.current) {
                   canvasRef.current.toBlob(blob => {
                     if (blob) onSave(gameStateRef.current!, blob);
                   });
                 }
              }}>Save</button>
              
              <button 
                className="neo-btn px-3 py-2 text-sm bg-yellow-400 hover:bg-yellow-500 col-span-2"
                onClick={() => {
                  if (!gameStateRef.current) return;
                  const boardW = config.image.width * 1.5;
                  const boardH = config.image.height * 1.5;
                  Object.values(gameStateRef.current.pieces).forEach(p => {
                    if (!p.isLocked) {
                      p.currentPose.x = (Math.random() - 0.5) * boardW + config.image.width/2;
                      p.currentPose.y = (Math.random() - 0.5) * boardH + config.image.height/2;
                      p.currentPose.rotation = config.rotationEnabled 
                        ? Math.floor(Math.random() * 4) * (Math.PI / 2) 
                        : 0;
                    }
                  });
                  spatialHashRef.current.clear();
                  Object.values(gameStateRef.current.pieces).forEach(p => spatialHashRef.current.insert(p));
                }}
              >
                Shuffle
              </button>
            </div>
          )}
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
