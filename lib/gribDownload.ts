import { Directory, File, Paths } from 'expo-file-system';

import {
  type DownloadDependencies,
  downloadGribWithDependencies,
} from './gribDownloadCore';
import { validateGribForApp } from './gribParser';
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
    validate: validateGribForApp,
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
