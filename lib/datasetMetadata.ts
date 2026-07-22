import type { GribDataset, GribParameterId, GribZone } from './gribTypes';

export const CURRENT_DATASET_SCHEMA = 2 as const;

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

export function decodeDatasetMetadata(value: unknown): DatasetMetadataResult {
  if (!isRecord(value)) return { success: false, reason: 'Métadonnée non structurée' };
  if (value.schemaVersion !== undefined && value.schemaVersion !== CURRENT_DATASET_SCHEMA) {
    return { success: false, reason: `Version de métadonnée non prise en charge (${String(value.schemaVersion)})` };
  }

  if (!validString(value.id) || !validString(value.fileName)) {
    return { success: false, reason: 'Identifiant ou fichier absent' };
  }
  if (value.fileName.includes('/') || value.fileName.includes('\\') || !/\.grib2?$/i.test(value.fileName)) {
    return { success: false, reason: 'Nom de fichier non sûr' };
  }

  const zone = readZone(value.zone);
  if (!zone) return { success: false, reason: 'Zone géographique invalide' };
  if (!validString(value.runDate) || !validString(value.runHour)) {
    return { success: false, reason: 'Run absent' };
  }
  if (!validFinite(value.downloadedAt) || value.downloadedAt < 0) {
    return { success: false, reason: 'Date de téléchargement invalide' };
  }
  if (!validFinite(value.fileSize) || value.fileSize < 0) {
    return { success: false, reason: 'Taille de fichier invalide' };
  }

  const legacy = value.schemaVersion === undefined;
  const imported = value.runHour === '--';
  const parameters = legacy
    ? (imported ? ['pressure'] : ['pressure', 'wind']) as GribParameterId[]
    : readParameters(value.parameters);
  const forecastHours = legacy ? [0] : readForecastHours(value.forecastHours);
  if (!parameters) return { success: false, reason: 'Paramètres invalides' };
  if (!forecastHours) return { success: false, reason: 'Échéances invalides' };

  const model = legacy ? (imported ? 'Importé' : 'GFS') : value.model;
  const resolution = legacy ? (imported ? 'Inconnue' : '0.25°') : value.resolution;
  if (!validString(model) || !validString(resolution)) {
    return { success: false, reason: 'Modèle ou résolution absent' };
  }

  return {
    success: true,
    migrated: legacy,
    dataset: {
      schemaVersion: CURRENT_DATASET_SCHEMA,
      id: value.id,
      fileName: value.fileName,
      zone,
      model: model.trim(),
      resolution: resolution.trim(),
      parameters,
      forecastHours,
      runDate: value.runDate,
      runHour: value.runHour,
      downloadedAt: value.downloadedAt,
      fileSize: value.fileSize,
    },
  };
}
