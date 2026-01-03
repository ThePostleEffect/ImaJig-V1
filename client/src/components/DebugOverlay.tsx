import React from 'react';
import { GameState, Piece } from '../engine/types';

interface DebugOverlayProps {
  gameState: GameState;
  camera: { x: number; y: number; zoom: number };
  width: number;
  height: number;
}

export const DebugOverlay: React.FC<DebugOverlayProps> = ({ gameState, camera, width, height }) => {
  const worldToScreen = (x: number, y: number) => {
    return {
      x: (x - camera.x) * camera.zoom + width / 2,
      y: (y - camera.y) * camera.zoom + height / 2
    };
  };

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <svg width="100%" height="100%">
        {Object.values(gameState.pieces).map(p => {
          const pos = worldToScreen(p.currentPose.x, p.currentPose.y);
          const correct = worldToScreen(p.correctPose.x, p.correctPose.y);
          
          // Only draw if on screen (rough check)
          if (pos.x < -100 || pos.x > width + 100 || pos.y < -100 || pos.y > height + 100) return null;

          return (
            <g key={p.id}>
              {/* Centroid */}
              <circle cx={pos.x} cy={pos.y} r={3} fill="red" />
              
              {/* ID Label */}
              <text x={pos.x + 5} y={pos.y - 5} fill="red" fontSize="10" fontFamily="monospace">
                {p.id.replace('piece_', '')}
              </text>
              
              {/* Ghost Correct Pose (if far) */}
              {/* <circle cx={correct.x} cy={correct.y} r={2} fill="rgba(0,255,0,0.5)" /> */}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
