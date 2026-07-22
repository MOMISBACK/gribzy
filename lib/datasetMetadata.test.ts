import { describe, expect, it } from 'vitest';

import { CURRENT_DATASET_SCHEMA, decodeDatasetMetadata } from './datasetMetadata';

const LEGACY = {
  id: 'legacy-1',
  fileName: 'bretagne.grib2',
  zone: { label: 'Bretagne', leftlon: -8, rightlon: 2, bottomlat: 45.5, toplat: 50.5 },
  runDate: '20260722',
  runHour: '06',
  downloadedAt: 123456,
  fileSize: 2048,
};

describe('decodeDatasetMetadata', () => {
  it('migre une métadonnée 1.1 sans perdre son identité', () => {
    const result = decodeDatasetMetadata(LEGACY);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.migrated).toBe(true);
    expect(result.dataset).toMatchObject({
      schemaVersion: CURRENT_DATASET_SCHEMA,
      id: LEGACY.id,
      fileName: LEGACY.fileName,
      model: 'GFS',
      resolution: '0.25°',
      parameters: ['pressure', 'wind'],
      forecastHours: [0],
    });
  });

  it('identifie prudemment un ancien import', () => {
    const result = decodeDatasetMetadata({ ...LEGACY, runHour: '--' });
    expect(result.success && result.dataset.model).toBe('Importé');
    expect(result.success && result.dataset.parameters).toEqual(['pressure']);
  });

  it('normalise les paramètres et échéances du schéma courant', () => {
    const result = decodeDatasetMetadata({
      ...LEGACY,
      schemaVersion: 2,
      model: 'GFS',
      resolution: '0.25°',
      parameters: ['wind', 'pressure', 'wind'],
      forecastHours: [6, 0, 3, 3],
    });
    expect(result.success && result.dataset.parameters).toEqual(['wind', 'pressure']);
    expect(result.success && result.dataset.forecastHours).toEqual([0, 3, 6]);
    expect(result.success && result.migrated).toBe(false);
  });

  it('refuse une version future au lieu de la deviner', () => {
    const result = decodeDatasetMetadata({ ...LEGACY, schemaVersion: 99 });
    expect(result).toEqual({
      success: false,
      reason: 'Version de métadonnée non prise en charge (99)',
    });
  });

  it('refuse les chemins dangereux et les zones incohérentes', () => {
    expect(decodeDatasetMetadata({ ...LEGACY, fileName: '../secret.grib2' }).success).toBe(false);
    expect(decodeDatasetMetadata({
      ...LEGACY,
      zone: { ...LEGACY.zone, leftlon: 20, rightlon: 10 },
    }).success).toBe(false);
  });
});
