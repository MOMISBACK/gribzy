import { describe, expect, it } from 'vitest';

import { computeIsobares, decodeValues, readDataRepresentation, validateGribForApp } from './gribParser';
import { NOAA_GFS_FIXTURE } from '../tests/fixtures/grib/noaaFixture';

function fixtureBytes() {
  return Uint8Array.from(Buffer.from(NOAA_GFS_FIXTURE, 'base64'));
}

describe('GRIB2 NOAA GFS fixture', () => {
  it('validates the expected parameters and 5 × 5 geographic grid', () => {
    const result = validateGribForApp(fixtureBytes());
    expect(result.messages).toHaveLength(3);
    expect(result.windU).toBeDefined();
    expect(result.windV).toBeDefined();
    expect(result.grid).toMatchObject({ ni: 5, nj: 5, lat1: 47, lon1: -5, lat2: 48, lon2: -4, template: 0, scanningMode: 64 });
  });

  it('decodes exact sea-level pressure samples from the fixture manifest', async () => {
    const bytes = fixtureBytes();
    const { pressure } = validateGribForApp(bytes);
    const values = await decodeValues(bytes, pressure.offset, readDataRepresentation(bytes, pressure.offset));
    expect(values).toHaveLength(25);
    expect(values[0]).toBeCloseTo(102526.375, 2);
    expect(values[12]).toBeCloseTo(102597.975, 2);
    expect(values[24]).toBeCloseTo(102661.575, 2);
  });
});

describe('isobars', () => {
  it('creates a contour through a simple pressure field', () => {
    const result = computeIsobares(new Float32Array([1000, 1010, 1000, 1010]), 2, 2, [1005]);
    expect(result.get(1005)).toHaveLength(1);
  });
});
