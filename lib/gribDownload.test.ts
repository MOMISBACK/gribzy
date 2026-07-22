import { describe, expect, it, vi } from 'vitest';

import {
  type DownloadDependencies,
  downloadGribWithDependencies,
  getRunCandidates,
} from './gribDownloadCore';
import type { GribDataset, GribZone } from './gribTypes';

const ZONE: GribZone = {
  label: 'Bretagne test',
  leftlon: -8,
  rightlon: 2,
  bottomlat: 45.5,
  toplat: 50.5,
};

function createDependencies(overrides: Partial<DownloadDependencies<string>> = {}) {
  const files = new Map<string, Uint8Array>();
  const saved: GribDataset[] = [];
  const removed: string[] = [];
  const dependencies: DownloadDependencies<string> = {
    now: () => new Date('2026-07-22T12:00:00Z'),
    prepare: vi.fn(),
    createTemporary: (name) => `tmp:${name}`,
    createDestination: (name) => `data:${name}`,
    removeIfExists: (target) => {
      if (files.delete(target)) removed.push(target);
    },
    download: async (_url, target) => {
      files.set(target, new Uint8Array([1, 2, 3]));
    },
    readBytes: async (target) => {
      const bytes = files.get(target);
      if (!bytes) throw new Error('Fichier temporaire absent');
      return bytes;
    },
    validate: () => ({ windU: {}, windV: {} }),
    move: (source, destination) => {
      const bytes = files.get(source);
      if (!bytes) throw new Error('Source absente');
      files.delete(source);
      files.set(destination, bytes);
    },
    size: (target) => files.get(target)?.byteLength ?? 0,
    saveMetadata: (dataset) => {
      saved.push(dataset);
    },
    ...overrides,
  };
  return { dependencies, files, saved, removed };
}

describe('getRunCandidates', () => {
  it('retarde le run de six heures et traverse correctement le jour précédent', () => {
    expect(getRunCandidates(new Date('2026-07-22T04:00:00Z')).slice(0, 2)).toEqual([
      { date: '20260721', hour: '18' },
      { date: '20260721', hour: '12' },
    ]);
  });
});

describe('downloadGribWithDependencies', () => {
  it('enregistre le premier run valide', async () => {
    const { dependencies, files, saved } = createDependencies();
    const dataset = await downloadGribWithDependencies(ZONE, dependencies);

    expect(dataset.runDate).toBe('20260722');
    expect(dataset.runHour).toBe('06');
    expect(dataset.fileSize).toBe(3);
    expect(saved).toEqual([dataset]);
    expect([...files.keys()]).toEqual([`data:${dataset.fileName}`]);
  });

  it('essaie le run précédent après une indisponibilité', async () => {
    let attempts = 0;
    const { dependencies, files, saved } = createDependencies();
    dependencies.download = async (_url, target) => {
      attempts++;
      if (attempts === 1) throw new Error('404 NOAA');
      files.set(target, new Uint8Array([4, 5]));
    };

    const dataset = await downloadGribWithDependencies(ZONE, dependencies);

    expect(attempts).toBe(2);
    expect(dataset.runHour).toBe('00');
    expect(saved).toHaveLength(1);
  });

  it('nettoie chaque réponse invalide et ne crée aucune métadonnée', async () => {
    const { dependencies, files, saved } = createDependencies({
      validate: () => {
        throw new Error('GRIB invalide');
      },
    });

    await expect(downloadGribWithDependencies(ZONE, dependencies))
      .rejects.toThrow('Téléchargement impossible. GRIB invalide');
    expect(files.size).toBe(0);
    expect(saved).toHaveLength(0);
  });

  it('arrête immédiatement une annulation et nettoie le temporaire', async () => {
    const controller = new AbortController();
    let attempts = 0;
    const { dependencies, files, saved } = createDependencies();
    dependencies.download = async (_url, target) => {
      attempts++;
      files.set(target, new Uint8Array([1]));
      controller.abort();
    };

    await expect(downloadGribWithDependencies(ZONE, dependencies, undefined, controller.signal))
      .rejects.toThrow('Téléchargement annulé');
    expect(attempts).toBe(1);
    expect(files.size).toBe(0);
    expect(saved).toHaveLength(0);
  });

  it('supprime le fichier final si les métadonnées ne peuvent pas être enregistrées', async () => {
    const { dependencies, files } = createDependencies({
      saveMetadata: () => {
        throw new Error('Stockage indisponible');
      },
    });

    await expect(downloadGribWithDependencies(ZONE, dependencies))
      .rejects.toThrow('Téléchargement impossible. Stockage indisponible');
    expect(files.size).toBe(0);
  });
});
