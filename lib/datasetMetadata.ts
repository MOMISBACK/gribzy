import type { ForecastFrameDescriptor, GribDataset, GribParameterId, GribZone } from './gribTypes';

export const CURRENT_DATASET_SCHEMA = 3 as const;

export type DatasetMetadataResult =
  | { success: true; dataset: GribDataset; migrated: boolean }
  | { success: false; reason: string };

const PARAMETERS = new Set<GribParameterId>(['pressure', 'wind', 'temperature', 'rain']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function validString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function readZone(value: unknown): GribZone | null {
  if (!isRecord(value) || !validString(value.label)) return null;
  const { leftlon, rightlon, bottomlat, toplat } = value;
  if (![leftlon, rightlon, bottomlat, toplat].every(validFinite)) return null;
  if (
    (leftlon as number) < -180 || (rightlon as number) > 180 ||
    (bottomlat as number) < -90 || (toplat as number) > 90 ||
    (leftlon as number) >= (rightlon as number) ||
    (bottomlat as number) >= (toplat as number)
  ) return null;
  return {
    label: value.label.trim(),
    leftlon: leftlon as number,
    rightlon: rightlon as number,
    bottomlat: bottomlat as number,
    toplat: toplat as number,
  };
}

function readParameters(value: unknown): GribParameterId[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const parameters = [...new Set(value)];
  if (!parameters.every((item): item is GribParameterId => typeof item === 'string' && PARAMETERS.has(item as GribParameterId))) {
    return null;
  }
  return parameters as GribParameterId[];
}

function readForecastHours(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (!value.every((item) => Number.isInteger(item) && item >= 0)) return null;
  return [...new Set(value as number[])].sort((a, b) => a - b);
}

function safeGribFileName(value: unknown): value is string {
  return validString(value) && !value.includes('/') && !value.includes('\\') && /\.grib2?$/i.test(value);
}

function validIsoDate(value: unknown): value is string {
  return validString(value) && Number.isFinite(Date.parse(value));
}

function validTimeFor(runDate: string, runHour: string, forecastHour: number, fallback: number): string {
  if (/^\d{8}$/.test(runDate) && /^\d{2}$/.test(runHour)) {
    const date = new Date(Date.UTC(
      Number(runDate.slice(0, 4)),
      Number(runDate.slice(4, 6)) - 1,
      Number(runDate.slice(6, 8)),
      Number(runHour),
    ));
    date.setUTCHours(date.getUTCHours() + forecastHour);
    if (Number.isFinite(date.getTime())) return date.toISOString();
  }
  return new Date(fallback).toISOString();
}

function readFrames(value: unknown): ForecastFrameDescriptor[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const frames: ForecastFrameDescriptor[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate) || !Number.isInteger(candidate.forecastHour) ||
        (candidate.forecastHour as number) < 0 || !validIsoDate(candidate.validTime) ||
        !validString(candidate.sourceId) || !safeGribFileName(candidate.sourceFileId)) return null;
    const messageIndexes = candidate.messageIndexes;
    if (messageIndexes !== undefined && (!Array.isArray(messageIndexes) ||
        !messageIndexes.every(item => Number.isInteger(item) && item >= 0))) return null;
    frames.push({
      forecastHour: candidate.forecastHour as number,
      validTime: candidate.validTime,
      sourceId: candidate.sourceId,
      sourceFileId: candidate.sourceFileId,
      ...(messageIndexes ? { messageIndexes: messageIndexes as number[] } : {}),
    });
  }
  frames.sort((a, b) => a.forecastHour - b.forecastHour);
  if (new Set(frames.map(frame => frame.forecastHour)).size !== frames.length) return null;
  return frames;
}

export function decodeDatasetMetadata(value: unknown): DatasetMetadataResult {
  if (!isRecord(value)) return { success: false, reason: 'Malformed metadata' };
  if (value.schemaVersion !== undefined && value.schemaVersion !== 2 && value.schemaVersion !== CURRENT_DATASET_SCHEMA) {
    return { success: false, reason: `Unsupported metadata version (${String(value.schemaVersion)})` };
  }

  if (!validString(value.id) || !validString(value.fileName)) {
    return { success: false, reason: 'Missing identifier or file' };
  }
  if (!safeGribFileName(value.fileName)) {
    return { success: false, reason: 'Unsafe file name' };
  }

  const zone = readZone(value.zone);
  if (!zone) return { success: false, reason: 'Invalid geographic area' };
  if (!validString(value.runDate) || !validString(value.runHour)) {
    return { success: false, reason: 'Run absent' };
  }
  if (!validFinite(value.downloadedAt) || value.downloadedAt < 0) {
    return { success: false, reason: 'Invalid download date' };
  }
  if (!validFinite(value.fileSize) || value.fileSize < 0) {
    return { success: false, reason: 'Invalid file size' };
  }

  const legacy = value.schemaVersion === undefined;
  const previousSchema = value.schemaVersion === 2;
  const imported = value.runHour === '--';
  const parameters = legacy
    ? (imported ? ['pressure'] : ['pressure', 'wind']) as GribParameterId[]
    : readParameters(value.parameters);
  const forecastHours = legacy ? [0] : readForecastHours(value.forecastHours);
  if (!parameters) return { success: false, reason: 'Paramètres invalides' };
  if (!forecastHours) return { success: false, reason: 'Échéances invalides' };

  const model = legacy ? (imported ? 'Imported' : 'GFS') : value.model;
  const resolution = legacy ? (imported ? 'Unknown' : '0.25°') : value.resolution;
  if (!validString(model) || !validString(resolution)) {
    return { success: false, reason: 'Modèle ou résolution absent' };
  }

  const sourceId = value.schemaVersion === CURRENT_DATASET_SCHEMA && validString(value.sourceId)
    ? value.sourceId : value.id;
  const effectiveForecastHours = value.schemaVersion === CURRENT_DATASET_SCHEMA
    ? forecastHours : [forecastHours[0]];
  const frames = value.schemaVersion === CURRENT_DATASET_SCHEMA
    ? readFrames(value.frames)
    : [{
        forecastHour: effectiveForecastHours[0],
        validTime: validTimeFor(value.runDate, value.runHour, effectiveForecastHours[0], value.downloadedAt),
        sourceId,
        sourceFileId: value.fileName,
      }];
  if (!frames) return { success: false, reason: 'Invalid forecast frames' };
  if (frames.some(frame => frame.sourceId !== sourceId) ||
      frames.map(frame => frame.forecastHour).join(',') !== effectiveForecastHours.join(',') ||
      frames[0].sourceFileId !== value.fileName) {
    return { success: false, reason: 'Inconsistent forecast manifest' };
  }

  return {
    success: true,
    migrated: legacy || previousSchema,
    dataset: {
      schemaVersion: CURRENT_DATASET_SCHEMA,
      id: value.id,
      fileName: value.fileName,
      sourceId,
      frames,
      zone,
      model: model.trim(),
      resolution: resolution.trim(),
      parameters,
      forecastHours: effectiveForecastHours,
      runDate: value.runDate,
      runHour: value.runHour,
      downloadedAt: value.downloadedAt,
      fileSize: value.fileSize,
    },
  };
}
