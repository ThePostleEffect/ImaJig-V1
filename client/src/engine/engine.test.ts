import { describe, it, expect } from 'vitest';
import { UnionFind } from './unionFind';
import { composePose, invertPose, distance } from './pose';

describe('UnionFind', () => {
  it('should initialize with separate sets', () => {
    const uf = new UnionFind(['a', 'b', 'c']);
    expect(uf.find('a')).toBe('a');
    expect(uf.find('b')).toBe('b');
    expect(uf.find('c')).toBe('c');
  });

  it('should union two elements', () => {
    const uf = new UnionFind(['a', 'b', 'c']);
    uf.union('a', 'b');
    expect(uf.find('a')).toBe(uf.find('b'));
    expect(uf.find('c')).not.toBe(uf.find('a'));
  });

  it('should handle transitive unions', () => {
    const uf = new UnionFind(['a', 'b', 'c', 'd']);
    uf.union('a', 'b');
    uf.union('b', 'c');
    expect(uf.find('a')).toBe(uf.find('c'));
    expect(uf.getSize('a')).toBe(3);
  });
});

describe('Pose Math', () => {
  it('should invert identity pose', () => {
    const p = { x: 0, y: 0, rotation: 0 };
    const inv = invertPose(p);
    expect(inv.x).toBeCloseTo(0);
    expect(inv.y).toBeCloseTo(0);
    expect(inv.rotation).toBeCloseTo(0);
  });

  it('should invert translation', () => {
    const p = { x: 10, y: 20, rotation: 0 };
    const inv = invertPose(p);
    expect(inv.x).toBe(-10);
    expect(inv.y).toBe(-20);
    expect(inv.rotation).toBe(-0);
  });

  it('should compose translations', () => {
    const p1 = { x: 10, y: 0, rotation: 0 };
    const p2 = { x: 5, y: 5, rotation: 0 };
    const res = composePose(p1, p2);
    expect(res.x).toBe(15);
    expect(res.y).toBe(5);
  });

  it('should compose rotation', () => {
    const p1 = { x: 0, y: 0, rotation: Math.PI / 2 }; // 90 deg
    const p2 = { x: 10, y: 0, rotation: 0 };
    const res = composePose(p1, p2);
    // Rotating (10,0) by 90 deg -> (0, 10)
    expect(res.x).toBeCloseTo(0);
    expect(res.y).toBeCloseTo(10);
    expect(res.rotation).toBe(Math.PI / 2);
  });
});
