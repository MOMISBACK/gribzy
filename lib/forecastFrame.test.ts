import { describe, expect, it } from 'vitest';

import { decodeForecastFrame } from './forecastFrame';
import { findGribMessages } from './gribParser';
import { NOAA_GFS_FIXTURE } from '../tests/fixtures/grib/noaaFixture';
import type { ForecastFrameDescriptor } from './gribTypes';

function fixtureBytes(): Uint8Array {
  return Uint8Array.from(Buffer.from(NOAA_GFS_FIXTURE, 'base64'));
}

const DESCRIPTOR: ForecastFrameDescriptor = {
  forecastHour: 0,
  validTime: '2026-07-22T00:00:00.000Z',
  sourceId: 'fixture',
  sourceFileId: 'fixture.grib2',
};

describe('decodeForecastFrame', () => {
  it('decodes pressure and wind as one atomic frame', async () => {
    const frame = await decodeForecastFrame(fixtureBytes(), DESCRIPTOR);
    expect(frame.availableLayers).toEqual({ pressure: true, wind: true });
    expect(frame.pressure?.values[0]).toBeCloseTo(1025.26375, 4);
    expect(frame.wind?.u).toHaveLength(25);
    expect(frame.wind?.v).toHaveLength(25);
  });

  it('keeps pressure usable when only U is present', async () => {
    const bytes = fixtureBytes();
    const messages = findGribMessages(bytes);
    const partial = Buffer.concat(messages.slice(0, 2).map(message =>
      Buffer.from(bytes.subarray(message.offset, message.offset + message.totalSize))
    ));
    const frame = await decodeForecastFrame(partial, DESCRIPTOR);
    expect(frame.availableLayers).toEqual({ pressure: true, wind: false });
    expect(frame.diagnostics.some(diagnostic => diagnostic.code === 'WIND_V_MISSING')).toBe(true);
  });

  it('rejects metadata whose valid time does not match the GRIB', async () => {
    await expect(decodeForecastFrame(fixtureBytes(), {
      ...DESCRIPTOR,
      validTime: '2026-07-22T03:00:00.000Z',
    })).rejects.toThrow(/valid time/);
  });
});
