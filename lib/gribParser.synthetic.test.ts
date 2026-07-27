import { describe, expect, it } from 'vitest';

import {
  bilinearInterpolate,
  analyzeGribForApp,
  buildFieldMatchKey,
  chooseAmbiguousContourConnection,
  computeIsobares,
  decodeValues,
  gridIndexToLatLon,
  isMeanSeaLevelPressureField,
  isTenMeterWindField,
  latLonToFractionalGridIndex,
  readDataRepresentation,
  readFieldIdentity,
  readGridDefinition,
  validateGribForApp,
} from './gribParser';

type FieldOptions = {
  discipline?: number;
  category?: number;
  parameter?: number;
  surfaceType?: number;
  surfaceValue?: number;
  forecastTime?: number;
  referenceHour?: number;
  productTemplate?: number;
  ni?: number;
  nj?: number;
  lat1?: number;
  lon1?: number;
  di?: number;
  dj?: number;
  scanningMode?: number;
  basicAngle?: number;
  subdivisions?: number;
  referenceValue?: number;
  binaryScale?: number;
  decimalScale?: number;
  bitsPerValue?: number;
  packed?: readonly number[];
};

function unsignedMagnitude(value: number, bits: 8 | 16 | 32): number {
  const sign = bits === 8 ? 0x80 : bits === 16 ? 0x8000 : 0x80000000;
  return value < 0 ? sign + Math.abs(value) : value;
}

function section(number: number, size: number): Buffer {
  const result = Buffer.alloc(size);
  result.writeUInt32BE(size, 0);
  result[4] = number;
  return result;
}

function pack(values: readonly number[], bits: number): Buffer {
  const result = Buffer.alloc(Math.ceil(values.length * bits / 8));
  values.forEach((value, index) => {
    for (let bit = 0; bit < bits; bit++) {
      const source = (value >> (bits - bit - 1)) & 1;
      const absolute = index * bits + bit;
      result[Math.floor(absolute / 8)] |= source << (7 - absolute % 8);
    }
  });
  return result;
}

function field(options: FieldOptions = {}): Uint8Array {
  const ni = options.ni ?? 2;
  const nj = options.nj ?? 2;
  const packed = options.packed ?? [0, 1, 2, 3];
  const bits = options.bitsPerValue ?? 2;
  const section1 = section(1, 21);
  section1.writeUInt16BE(2026, 12);
  section1[14] = 7;
  section1[15] = 27;
  section1[16] = options.referenceHour ?? 0;

  const section3 = section(3, 72);
  section3.writeUInt32BE(ni * nj, 6);
  section3.writeUInt16BE(0, 12);
  section3.writeUInt32BE(ni, 30);
  section3.writeUInt32BE(nj, 34);
  const basicAngle = options.basicAngle ?? 0;
  const subdivisions = options.subdivisions ?? 0xffffffff;
  section3.writeUInt32BE(basicAngle, 38);
  section3.writeUInt32BE(subdivisions, 42);
  const unit = basicAngle === 0 ? 1e-6 : basicAngle / subdivisions;
  section3.writeUInt32BE(unsignedMagnitude(Math.round((options.lat1 ?? 45) / unit), 32), 46);
  section3.writeUInt32BE(unsignedMagnitude(Math.round((options.lon1 ?? -5) / unit), 32), 50);
  section3.writeUInt32BE(unsignedMagnitude(Math.round(((options.lat1 ?? 45) + (nj - 1) * (options.dj ?? 1)) / unit), 32), 55);
  section3.writeUInt32BE(unsignedMagnitude(Math.round(((options.lon1 ?? -5) + (ni - 1) * (options.di ?? 1)) / unit), 32), 59);
  section3.writeUInt32BE(Math.round((options.di ?? 1) / unit), 63);
  section3.writeUInt32BE(Math.round((options.dj ?? 1) / unit), 67);
  section3[71] = options.scanningMode ?? 64;

  const section4 = section(4, 34);
  section4.writeUInt16BE(options.productTemplate ?? 0, 7);
  section4[9] = options.category ?? 3;
  section4[10] = options.parameter ?? 1;
  section4[11] = 2;
  section4[13] = 96;
  section4[17] = 1;
  section4.writeUInt32BE(options.forecastTime ?? 0, 18);
  section4[22] = options.surfaceType ?? 101;
  section4[23] = 0;
  section4.writeUInt32BE(options.surfaceValue ?? 0, 24);
  section4.fill(0xff, 28, 34);

  const section5 = section(5, 21);
  section5.writeUInt32BE(ni * nj, 5);
  section5.writeUInt16BE(0, 9);
  section5.writeFloatBE(options.referenceValue ?? 1000, 11);
  section5.writeUInt16BE(unsignedMagnitude(options.binaryScale ?? 0, 16), 15);
  section5.writeUInt16BE(unsignedMagnitude(options.decimalScale ?? 0, 16), 17);
  section5[19] = bits;
  const section6 = section(6, 6);
  section6[5] = 255;
  const payload = pack(packed, bits);
  const section7 = section(7, 5 + payload.length);
  payload.copy(section7, 5);
  const totalSize = 16 + section1.length + section3.length + section4.length +
    section5.length + section6.length + section7.length + 4;
  const indicator = Buffer.alloc(16);
  indicator.write('GRIB', 0);
  indicator[6] = options.discipline ?? 0;
  indicator[7] = 2;
  indicator.writeBigUInt64BE(BigInt(totalSize), 8);
  return Buffer.concat([indicator, section1, section3, section4, section5, section6, section7, Buffer.from('7777')]);
}

function concatenate(...messages: Uint8Array[]): Uint8Array {
  return Buffer.concat(messages.map(message => Buffer.from(message)));
}

describe('exact simple packing', () => {
  it.each([
    [{ referenceValue: 10, binaryScale: 1, decimalScale: 0, bitsPerValue: 2, packed: [0, 1, 2, 3] }, [10, 12, 14, 16]],
    [{ referenceValue: -5, binaryScale: -1, decimalScale: 1, bitsPerValue: 3, packed: [0, 2, 4, 6] }, [-0.5, -0.4, -0.3, -0.2]],
    [{ referenceValue: 42, bitsPerValue: 0, packed: [0, 0, 0, 0] }, [42, 42, 42, 42]],
  ] as const)('decodes R/E/D and bit depth exactly', async (options, expected) => {
    const bytes = field(options);
    const values = await decodeValues(bytes, 0, readDataRepresentation(bytes, 0));
    expected.forEach((value, index) => expect(values[index]).toBeCloseTo(value, 6));
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])('rejects a non-finite reference value', value => {
    expect(() => readDataRepresentation(field({ referenceValue: value }), 0)).toThrow(/Non-finite/);
  });
});

describe('field identity and matching', () => {
  it('requires meteorological discipline for PRMSL', () => {
    expect(isMeanSeaLevelPressureField(readFieldIdentity(field(), 0))).toBe(true);
    expect(isMeanSeaLevelPressureField(readFieldIdentity(field({ discipline: 10 }), 0))).toBe(false);
    expect(() => validateGribForApp(field({ discipline: 10 }))).toThrow(/pressure is missing or unsupported/);
  });

  it('distinguishes 10 m wind from an isobaric wind', () => {
    expect(isTenMeterWindField(readFieldIdentity(field({
      category: 2, parameter: 2, surfaceType: 103, surfaceValue: 10,
    }), 0))).toBe(true);
    expect(isTenMeterWindField(readFieldIdentity(field({
      category: 2, parameter: 2, surfaceType: 100, surfaceValue: 100_000,
    }), 0))).toBe(false);
  });

  it('rejects an unsupported product template', () => {
    expect(() => readFieldIdentity(field({ productTemplate: 8 }), 0)).toThrow(/product definition template/);
  });

  it('pairs U and V only with the same complete identity', () => {
    const pressure = field();
    const u = field({ category: 2, parameter: 2, surfaceType: 103, surfaceValue: 10 });
    const v = field({ category: 2, parameter: 3, surfaceType: 103, surfaceValue: 10 });
    const valid = validateGribForApp(concatenate(pressure, u, v));
    expect(valid.windU).toBeDefined();
    expect(buildFieldMatchKey(valid.windUField!)).toBe(buildFieldMatchKey(valid.windVField!));

    const mismatched = field({
      category: 2, parameter: 3, surfaceType: 103, surfaceValue: 10, forecastTime: 3,
    });
    const partial = analyzeGribForApp(concatenate(pressure, u, mismatched));
    expect(partial.pressureField).toBeDefined();
    expect(partial.windUField).toBeUndefined();
    expect(partial.diagnostics.some(diagnostic => diagnostic.code === 'WIND_COMPONENTS_MISMATCHED')).toBe(true);
  });

  it('keeps pressure but disables wind for different times, grids and levels', () => {
    const pressure = field();
    const u = field({ category: 2, parameter: 2, surfaceType: 103, surfaceValue: 10 });
    const wrongTime = field({
      category: 2, parameter: 3, surfaceType: 103, surfaceValue: 10, referenceHour: 6,
    });
    const wrongGrid = field({
      category: 2, parameter: 3, surfaceType: 103, surfaceValue: 10, di: 2,
    });
    const wrongLevel = field({
      category: 2, parameter: 3, surfaceType: 100, surfaceValue: 100_000,
    });
    for (const invalidV of [wrongTime, wrongGrid, wrongLevel]) {
      const result = analyzeGribForApp(concatenate(pressure, u, invalidV));
      expect(result.pressureField).toBeDefined();
      expect(result.windUField).toBeUndefined();
      expect(result.windVField).toBeUndefined();
    }
  });
});

describe('grid geometry and interpolation', () => {
  it('maps first, center and last points without download metadata', () => {
    const grid = readGridDefinition(field({ ni: 3, nj: 3, packed: Array(9).fill(0) }), 0);
    expect(gridIndexToLatLon(0, 0, grid)).toEqual({ latitude: 45, longitude: -5 });
    expect(gridIndexToLatLon(1, 1, grid)).toEqual({ latitude: 46, longitude: -4 });
    expect(gridIndexToLatLon(2, 2, grid)).toEqual({ latitude: 47, longitude: -3 });
    expect(latLonToFractionalGridIndex(45.5, -4.5, grid)).toEqual({ i: 0.5, j: 0.5 });
  });

  it('supports an explicit non-standard angular scale', () => {
    const grid = readGridDefinition(field({ basicAngle: 1, subdivisions: 1000 }), 0);
    expect(grid.di).toBe(1);
    expect(grid.lat1).toBe(45);
  });

  it('rejects unsupported scanning, malformed scale and antimeridian grids', () => {
    expect(() => readGridDefinition(field({ scanningMode: 0 }), 0)).toThrow(/scanning mode/);
    expect(() => readGridDefinition(field({ basicAngle: 0, subdivisions: 1000 }), 0)).toThrow(/angular scale/);
    expect(() => readGridDefinition(field({ lon1: 179, di: 2 }), 0)).toThrow(/antimeridian/);
  });

  it('rejects inconsistent increments, endpoints and point counts', () => {
    const wrongEndpoint = Buffer.from(field());
    wrongEndpoint.writeUInt32BE(unsignedMagnitude(-3_500_000, 32), 16 + 21 + 59);
    expect(() => readGridDefinition(wrongEndpoint, 0)).toThrow(/geometry/);
    const wrongCount = Buffer.from(field());
    wrongCount.writeUInt32BE(3, 16 + 21 + 6);
    expect(() => readGridDefinition(wrongCount, 0)).toThrow(/point count/);
  });

  it('interpolates corners, center, edge and exact grid points', () => {
    const values = new Float32Array([0, 10, 20, 30]);
    expect(bilinearInterpolate(values, 2, 2, 0, 0)).toBe(0);
    expect(bilinearInterpolate(values, 2, 2, 1, 1)).toBe(30);
    expect(bilinearInterpolate(values, 2, 2, 0.5, 0.5)).toBe(15);
    expect(bilinearInterpolate(values, 2, 2, 0.5, 0)).toBe(5);
    expect(bilinearInterpolate(values, 2, 2, -0.1, 0)).toBeNull();
    expect(bilinearInterpolate([0, Number.NaN, 20, 30], 2, 2, 0.5, 0.5)).toBeNull();
  });
});

describe('strict message structure and contours', () => {
  it('rejects truncation, a missing terminator and invalid section order', () => {
    const valid = Buffer.from(field());
    expect(() => validateGribForApp(valid.subarray(0, -1))).toThrow(/Truncated|marker/);
    const noMarker = Buffer.from(valid);
    noMarker.fill(0, noMarker.length - 4);
    expect(() => validateGribForApp(noMarker)).toThrow(/end marker/);
    const wrongOrder = Buffer.from(valid);
    const section1Offset = 16;
    wrongOrder[section1Offset + 4] = 3;
    expect(() => validateGribForApp(wrongOrder)).toThrow(/out of order/);
  });

  it('rejects insufficient or excess section 7 data', () => {
    const valid = Buffer.from(field());
    const section7Offset = 16 + 21 + 72 + 34 + 21 + 6;
    valid.writeUInt32BE(5, section7Offset);
    expect(() => validateGribForApp(valid)).toThrow(/section|coverage|end marker|Unexpected data|out of order/);
  });

  it('decides ambiguous marching-square cases from the cell center', () => {
    expect(chooseAmbiguousContourConnection(10, 0, 10, 0, 4)).toBe(true);
    expect(chooseAmbiguousContourConnection(10, 0, 10, 0, 6)).toBe(false);
    expect(computeIsobares(new Float32Array([10, 0, 0, 10]), 2, 2, [4]).get(4)).toHaveLength(2);
    expect(computeIsobares(new Float32Array([0, 10, 10, 0]), 2, 2, [6]).get(6)).toHaveLength(2);
  });
});
