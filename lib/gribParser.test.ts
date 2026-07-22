import { describe, expect, it } from 'vitest';

import { computeIsobares, decodeValues, readDataRepresentation, validateGribForApp } from './gribParser';

const NOAA_GFS_FIXTURE = 'R1JJQgAAAAIAAAAAAAAA0AAAABUBAAcAAAIBAQfqBxYAAAAAAQAAAEgDAAAAABkAAAAABgAAAAAAAAAAAAAAAAAAAAAAAAUAAAAFAAAAAP////8CzSnAFSjewDAC3GwAFTghAAAD0JAAA9CQQAAAACIEAAAAAAMBAgBRAAAAAQAAAABlAAAAAAD/AAAAAAAAAAAVBQAAABkAAEl6O7wAAgABCQAAAAAGBv8AAAAiByaNxIEgAslCkT6aZZGoA5GRf7XVZjCedvdhtc+ANzc3N0dSSUIAAAACAAAAAAAAANMAAAAVAQAHAAACAQEH6gcWAAAAAAEAAABIAwAAAAAZAAAAAAYAAAAAAAAAAAAAAAAAAAAAAAAFAAAABQAAAAD/////As0pwBUo3sAwAtxsABU4IQAAA9CQAAPQkEAAAAAiBAAAAAACAgIAUQAAAAEAAAAAZwAAAAAK/wAAAAAAAAAAFQUAAAAZAADESZIsAAAAAgoAAAAABgb/AAAAJQcEwIAMDgSC8AACCMPx9HccRIEk5j6R9YE7SlYnbl+eQDc3NzdHUklCAAAAAgAAAAAAAADQAAAAFQEABwAAAgEBB+oHFgAAAAABAAAASAMAAAAAGQAAAAAGAAAAAAAAAAAAAAAAAAAAAAAABQAAAAUAAAAA/////wLNKcAVKN7AMALcbAAVOCEAAAPQkAAD0JBAAAAAIgQAAAAAAgMCAFEAAAABAAAAAGcAAAAACv8AAAAAAAAAABUFAAAAGQAAxBuS8AAAAAIJAAAAAAYG/wAAACIHIBAEgPAAnEQeFY3IhGHwiERJJhNLRNJphbkroQA3Nzc3';

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

  it('decodes plausible sea-level pressure values', async () => {
    const bytes = fixtureBytes();
    const { pressure } = validateGribForApp(bytes);
    const values = await decodeValues(bytes, pressure.offset, readDataRepresentation(bytes, pressure.offset));
    const hPa = [...values].map(value => value / 100);
    expect(hPa).toHaveLength(25);
    expect(Math.min(...hPa)).toBeGreaterThan(850);
    expect(Math.max(...hPa)).toBeLessThan(1100);
  });
});

describe('isobars', () => {
  it('creates a contour through a simple pressure field', () => {
    const result = computeIsobares(new Float32Array([1000, 1010, 1000, 1010]), 2, 2, [1005]);
    expect(result.get(1005)).toHaveLength(1);
  });
});
