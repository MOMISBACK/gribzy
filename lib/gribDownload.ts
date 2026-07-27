import { Directory, File, Paths } from 'expo-file-system';

import {
  type DownloadDependencies,
  downloadGribWithDependencies,
} from './gribDownloadCore';
import { analyzeGribForApp } from './gribParser';
import type { GribDataset, GribZone } from './gribTypes';
import { saveDatasetMetadata } from './storage';

export {
  buildNomadsUrl,
  type DownloadDependencies,
  downloadGribWithDependencies,
  getRunCandidates,
  type RunCandidate,
} from './gribDownloadCore';
export type { GribZone } from './gribTypes';

const DATA_DIRECTORY = 'gribzy-data';

function createExpoDependencies(): DownloadDependencies<File> {
  const directory = new Directory(Paths.document, DATA_DIRECTORY);

  return {
    now: () => new Date(),
    prepare: () => {
      if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
    },
    createTemporary: (name) => new File(Paths.cache, name),
    createDestination: (name) => new File(directory, name),
    removeIfExists: (file) => {
      if (file.exists) file.delete();
    },
    download: async (url, target) => {
      await File.downloadFileAsync(url, target);
    },
    readBytes: (file) => file.bytes(),
    validate: (bytes, forecastHour, validTime) => {
      const analyzed = analyzeGribForApp(bytes);
      for (const field of [
        analyzed.pressureField,
        analyzed.windUField,
        analyzed.windVField,
      ].filter(field => field !== undefined)) {
        if (field.identity.forecastTimeUnit !== 1 || field.identity.forecastTime !== forecastHour) {
          throw new Error(`NOAA returned the wrong forecast time for H+${forecastHour}`);
        }
        const fieldValidTime = new Date(
          Date.parse(field.identity.referenceTime) + field.identity.forecastTime * 60 * 60 * 1000
        ).toISOString();
        if (fieldValidTime !== validTime) {
          throw new Error(`NOAA returned the wrong run for H+${forecastHour}`);
        }
      }
      return {
        pressure: analyzed.pressureField,
        windU: analyzed.windUField,
        windV: analyzed.windVField,
      };
    },
    move: (source, destination) => source.move(destination),
    size: (file) => file.size,
    saveMetadata: saveDatasetMetadata,
  };
}
export async function downloadGrib(
  zone: GribZone,
  onProgress?: (message: string) => void,
  signal?: AbortSignal,
): Promise<GribDataset> {
  return downloadGribWithDependencies(zone, createExpoDependencies(), onProgress, signal);
}
