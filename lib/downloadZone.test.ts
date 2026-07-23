import { describe, expect, it } from 'vitest';

import { canDownloadVisibleZone, estimateGridPoints, zoneFromVisibleBounds } from './downloadZone';

describe('visible download zone', () => {
  it('uses the visible bounds and localizes the automatic name', () => {
    const english = zoneFromVisibleBounds([-8.04, 45.46, 2.03, 50.54], 'en');
    const french = zoneFromVisibleBounds([-8.04, 45.46, 2.03, 50.54], 'fr');

    expect(english).toMatchObject({ leftlon: -8, rightlon: 2, bottomlat: 45.5, toplat: 50.5 });
    expect(english.label).toContain('Brittany');
    expect(french.label).toContain('Bretagne');
  });

  it('allows a practical viewport and rejects an excessively wide one', () => {
    const local = zoneFromVisibleBounds([-8, 45, 12, 55], 'en');
    const continental = zoneFromVisibleBounds([-30, 20, 30, 70], 'en');

    expect(estimateGridPoints(local)).toBeLessThan(10_000);
    expect(canDownloadVisibleZone(local)).toBe(true);
    expect(canDownloadVisibleZone(continental)).toBe(false);
  });
});
