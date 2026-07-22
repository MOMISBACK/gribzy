import { Directory, File, Paths } from 'expo-file-system';

import type { GribDataset } from './gribTypes';
import { validateGribForApp } from './gribParser';
import { decodeDatasetMetadata } from './datasetMetadata';

const DATA_DIRECTORY = 'gribzy-data';

function getDataDirectory(): Directory {
  const directory = new Directory(Paths.document, DATA_DIRECTORY);
  if (!directory.exists) {
    directory.create({ intermediates: true, idempotent: true });
  }
  return directory;
}

export function getDatasetFile(fileName: string): File {
  return new File(getDataDirectory(), fileName);
}

export function saveDatasetMetadata(dataset: GribDataset): void {
  const metadata = new File(getDataDirectory(), `${dataset.id}.json`);
  metadata.create({ overwrite: true, intermediates: true });
  metadata.write(JSON.stringify(dataset));
}

export async function importGribFile(uri: string, originalName: string): Promise<GribDataset> {
  const source = new File(uri);
  if (source.size > 100 * 1024 * 1024) throw new Error('The file exceeds the 100 MB limit.');
  const bytes = await source.bytes();
  const { grid } = validateGribForApp(bytes);
  const now = new Date();
  const id = `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
  const cleanName = originalName.replace(/\.grib2?$|\.grb2?$/i, '').trim() || 'Imported GRIB';
  const runDate = now.toISOString().slice(0, 10).replace(/-/g, '');
  const fileName = `${slugifyName(cleanName)}-${id}.grib2`;
  const destination = getDatasetFile(fileName);
  const dataset: GribDataset = {
    schemaVersion: 2,
    id,
    fileName,
    zone: {
      leftlon: Math.min(grid.lon1, grid.lon2),
      rightlon: Math.max(grid.lon1, grid.lon2),
      bottomlat: Math.min(grid.lat1, grid.lat2),
      toplat: Math.max(grid.lat1, grid.lat2),
      label: cleanName,
    },
    model: 'Imported',
    resolution: 'Unknown',
    parameters: ['pressure'],
    forecastHours: [0],
    runDate,
    runHour: '--',
    downloadedAt: now.getTime(),
    fileSize: bytes.byteLength,
  };
  try {
    destination.create({ overwrite: false, intermediates: true });
    destination.write(bytes);
    saveDatasetMetadata(dataset);
    return dataset;
  } catch (error) {
    if (destination.exists) destination.delete();
    throw error;
  }
}

export interface CatalogIssue {
  type: 'corrupt_metadata' | 'missing_data' | 'orphan_data' | 'migration_write_failed';
  entryName: string;
  message: string;
}

export interface GribCatalog {
  datasets: GribDataset[];
  issues: CatalogIssue[];
}

export async function readGribCatalog(): Promise<GribCatalog> {
  const entries = getDataDirectory().list();
  const datasets: GribDataset[] = [];
  const issues: CatalogIssue[] = [];
  const referencedFiles = new Set<string>();

  for (const entry of entries) {
    if (!(entry instanceof File) || !entry.name.endsWith('.json')) continue;
    try {
      const decoded = decodeDatasetMetadata(JSON.parse(await entry.text()));
      if (!decoded.success) {
        issues.push({ type: 'corrupt_metadata', entryName: entry.name, message: decoded.reason });
        continue;
      }
      const { dataset } = decoded;
      const dataFile = getDatasetFile(dataset.fileName);
      referencedFiles.add(dataset.fileName);
      if (!dataFile.exists) {
        issues.push({ type: 'missing_data', entryName: entry.name, message: `Missing file: ${dataset.fileName}` });
        continue;
      }
      datasets.push(dataset);
      if (decoded.migrated) {
        try {
          saveDatasetMetadata(dataset);
        } catch (error) {
          issues.push({
            type: 'migration_write_failed',
            entryName: entry.name,
            message: error instanceof Error ? error.message : 'Migration failed',
          });
        }
      }
    } catch (error) {
      issues.push({
        type: 'corrupt_metadata',
        entryName: entry.name,
        message: error instanceof Error ? error.message : 'Unreadable JSON',
      });
    }
  }

  for (const entry of entries) {
    if (
      entry instanceof File && /\.grib2?$/i.test(entry.name) &&
      !referencedFiles.has(entry.name)
    ) {
      issues.push({ type: 'orphan_data', entryName: entry.name, message: 'No valid metadata references this file' });
    }
  }

  return { datasets: datasets.sort((a, b) => b.downloadedAt - a.downloadedAt), issues };
}

export async function listGribDatasets(): Promise<GribDataset[]> {
  return (await readGribCatalog()).datasets;
}

export function deleteGribDataset(dataset: GribDataset): void {
  const data = getDatasetFile(dataset.fileName);
  const metadata = new File(getDataDirectory(), `${dataset.id}.json`);
  if (data.exists) data.delete();
  if (metadata.exists) metadata.delete();
}

function slugifyName(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 52) || 'zone-meteo';
}

export function renameGribDataset(dataset: GribDataset, requestedName: string): GribDataset {
  const name = requestedName.trim().replace(/\s+/g, ' ');
  if (!name) throw new Error('The name cannot be empty.');
  if (name.length > 80) throw new Error('The name is limited to 80 characters.');

  const currentFile = getDatasetFile(dataset.fileName);
  if (!currentFile.exists) throw new Error('The GRIB file cannot be found.');
  const nextFileName = `${slugifyName(name)}-${dataset.runDate}-${dataset.runHour}z-${dataset.id}.grib2`;
  const nextFile = getDatasetFile(nextFileName);
  if (nextFile.exists && nextFileName !== dataset.fileName) throw new Error('A file already has this name.');

  const moved = nextFileName !== dataset.fileName;
  if (moved) currentFile.move(nextFile);
  const renamed = { ...dataset, fileName: nextFileName, zone: { ...dataset.zone, label: name } };
  try {
    saveDatasetMetadata(renamed);
    return renamed;
  } catch (error) {
    if (moved && nextFile.exists) nextFile.move(currentFile);
    throw error;
  }
}

export function formatFileSize(bytes: number, language: 'en' | 'fr' = 'en'): string {
  if (bytes < 1024) return `${bytes} ${language === 'fr' ? 'o' : 'B'}`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ${language === 'fr' ? 'Ko' : 'KB'}`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ${language === 'fr' ? 'Mo' : 'MB'}`;
}

export function formatDate(timestamp: number, language: 'en' | 'fr' = 'en'): string {
  return new Date(timestamp).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
