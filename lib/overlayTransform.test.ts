import { describe, expect, it } from 'vitest';

import { computeOverlayTransform } from './overlayTransform';

describe('computeOverlayTransform', () => {
  it('returns the identity for unchanged bounds', () => {
    expect(computeOverlayTransform([-10, 40, 10, 50], [-10, 40, 10, 50], 400, 800)).toEqual({
      translateX: 0,
      translateY: 0,
      scaleX: 1,
      scaleY: 1,
    });
  });

  it('translates the frozen overlay during an eastward pan', () => {
    const transform = computeOverlayTransform([-10, 40, 10, 50], [-5, 40, 15, 50], 400, 800);
    expect(transform?.scaleX).toBeCloseTo(1);
    expect(transform?.translateX).toBeCloseTo(-100);
    expect(transform?.translateY).toBeCloseTo(0);
  });

  it('scales the frozen overlay around the top-left origin during a zoom', () => {
    const transform = computeOverlayTransform([-10, 40, 10, 50], [-5, 42.5, 5, 47.5], 400, 800);
    expect(transform?.scaleX).toBeCloseTo(2);
    expect(transform?.scaleY).toBeGreaterThan(1.9);
    expect(transform?.scaleY).toBeLessThan(2.1);
  });

  it('rejects invalid bounds', () => {
    expect(computeOverlayTransform([10, 40, -10, 50], [-5, 42, 5, 48], 400, 800)).toBeNull();
  });
});
