import { Pose, Point } from './types';

export function composePose(parent: Pose, child: Pose): Pose {
  // Apply parent rotation to child position
  const cos = Math.cos(parent.rotation);
  const sin = Math.sin(parent.rotation);
  
  const x = parent.x + (child.x * cos - child.y * sin);
  const y = parent.y + (child.x * sin + child.y * cos);
  const rotation = parent.rotation + child.rotation;
  
  return { x, y, rotation };
}

export function invertPose(pose: Pose): Pose {
  const cos = Math.cos(pose.rotation);
  const sin = Math.sin(pose.rotation);
  
  const x = -(pose.x * cos + pose.y * sin);
  const y = -(-pose.x * sin + pose.y * cos);
  const rotation = -pose.rotation;
  
  return { x, y, rotation };
}

export function getDeltaPose(from: Pose, to: Pose): Pose {
  // Calculate pose of 'to' relative to 'from'
  // This is effectively: invert(from) * to
  const invFrom = invertPose(from);
  return composePose(invFrom, to);
}

export function distance(p1: Point, p2: Point): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function rotatePoint(point: Point, angle: number): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}
