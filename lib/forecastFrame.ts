import {
  type GribGrid,
  type GribLayerDiagnostic,
  analyzeGribForApp,
  computeIsobares,
  decodeValues,
} from './gribParser';
import type { ForecastFrameDescriptor } from './gribTypes';

export interface PressureField {
  values: Float32Array;
  grid: GribGrid;
  min: number;
  max: number;
  isobares: ReturnType<typeof computeIsobares>;
}

export interface WindField {
  u: Float32Array;
  v: Float32Array;
  grid: GribGrid;
}

export interface ForecastFrame {
  descriptor: ForecastFrameDescriptor;
  pressure?: PressureField;
  wind?: WindField;
  diagnostics: GribLayerDiagnostic[];
  availableLayers: {
    pressure: boolean;
    wind: boolean;
  };
}

function ensureDescriptorMatches(
  descriptor: ForecastFrameDescriptor,
  forecastTime: number,
  forecastTimeUnit: number,
  referenceTime: string
) {
  if (forecastTimeUnit !== 1 || forecastTime !== descriptor.forecastHour) {
    throw new Error(`GRIB forecast time does not match H+${descriptor.forecastHour}`);
  }
  const validTime = new Date(Date.parse(referenceTime) + forecastTime * 60 * 60 * 1000).toISOString();
  if (validTime !== descriptor.validTime) {
    throw new Error(`GRIB valid time does not match ${descriptor.validTime}`);
  }
}

function pressureLevels(min: number, max: number): number[] {
  const levels: number[] = [];
  for (let level = Math.ceil(min / 4) * 4; level <= max; level += 4) levels.push(level);
  return levels;
}

export async function decodeForecastFrame(
  bytes: Uint8Array,
  descriptor: ForecastFrameDescriptor
): Promise<ForecastFrame> {
  const analyzed = analyzeGribForApp(bytes);
  let pressure: PressureField | undefined;
  let wind: WindField | undefined;

  if (analyzed.pressureField) {
    ensureDescriptorMatches(
      descriptor,
      analyzed.pressureField.identity.forecastTime,
      analyzed.pressureField.identity.forecastTimeUnit,
      analyzed.pressureField.identity.referenceTime
    );
    const raw = await decodeValues(
      bytes,
      analyzed.pressureField.message.offset,
      analyzed.pressureField.representation
    );
    const values = new Float32Array(raw.length);
    let min = Infinity;
    let max = -Infinity;
    raw.forEach((value, index) => {
      const hPa = value / 100;
      if (!Number.isFinite(hPa)) throw new Error('Non-finite GRIB pressure value');
      values[index] = hPa;
      min = Math.min(min, hPa);
      max = Math.max(max, hPa);
    });
    if (!Number.isFinite(min) || !Number.isFinite(max)) throw new Error('Invalid GRIB pressure extrema');
    pressure = {
      values,
      grid: analyzed.pressureField.grid,
      min,
      max,
      isobares: computeIsobares(
        values,
        analyzed.pressureField.grid.ni,
        analyzed.pressureField.grid.nj,
        pressureLevels(min, max)
      ),
    };
  }

  if (analyzed.windUField && analyzed.windVField) {
    ensureDescriptorMatches(
      descriptor,
      analyzed.windUField.identity.forecastTime,
      analyzed.windUField.identity.forecastTimeUnit,
      analyzed.windUField.identity.referenceTime
    );
    ensureDescriptorMatches(
      descriptor,
      analyzed.windVField.identity.forecastTime,
      analyzed.windVField.identity.forecastTimeUnit,
      analyzed.windVField.identity.referenceTime
    );
    const [u, v] = await Promise.all([
      decodeValues(bytes, analyzed.windUField.message.offset, analyzed.windUField.representation),
      decodeValues(bytes, analyzed.windVField.message.offset, analyzed.windVField.representation),
    ]);
    wind = { u, v, grid: analyzed.windUField.grid };
  }

  if (!pressure && !wind) throw new Error('No usable weather layer in this forecast frame');
  return {
    descriptor,
    pressure,
    wind,
    diagnostics: analyzed.diagnostics,
    availableLayers: { pressure: !!pressure, wind: !!wind },
  };
}
