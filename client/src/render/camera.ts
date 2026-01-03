import { Point } from '../engine/types';

export class Camera {
  x: number = 0;
  y: number = 0;
  zoom: number = 1;
  
  private minZoom = 0.1;
  private maxZoom = 5;

  constructor(initialX: number, initialY: number, initialZoom: number) {
    this.x = initialX;
    this.y = initialY;
    this.zoom = initialZoom;
  }

  pan(dx: number, dy: number) {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
  }

  setZoom(newZoom: number, center?: Point) {
    const oldZoom = this.zoom;
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, newZoom));

    if (center) {
      // Zoom towards center
      // World pos of center should remain same
      // W = C_screen / oldZoom + oldCam
      // W = C_screen / newZoom + newCam
      // newCam = oldCam + C_screen * (1/oldZoom - 1/newZoom)
      
      const factor = 1 / oldZoom - 1 / this.zoom;
      this.x += center.x * factor;
      this.y += center.y * factor;
    }
  }

  screenToWorld(sx: number, sy: number): Point {
    return {
      x: sx / this.zoom + this.x,
      y: sy / this.zoom + this.y,
    };
  }

  worldToScreen(wx: number, wy: number): Point {
    return {
      x: (wx - this.x) * this.zoom,
      y: (wy - this.y) * this.zoom,
    };
  }
}
