import type { GribDataset, GribZone } from './gribTypes';

const RUN_DELAY_HOURS = 6;

export interface RunCandidate {
  date: string;
  hour: string;
}

interface ValidatedDownload {
  windU?: unknown;
  windV?: unknown;
}

export interface DownloadDependencies<TTarget> {
  now: () => Date;
  prepare: () => void;
  createTemporary: (name: string) => TTarget;
  createDestination: (name: string) => TTarget;
  removeIfExists: (target: TTarget) => void;
  download: (url: string, target: TTarget) => Promise<void>;
  readBytes: (target: TTarget) => Promise<Uint8Array>;
  validate: (bytes: Uint8Array) => ValidatedDownload;
  move: (source: TTarget, destination: TTarget) => void;
  size: (target: TTarget) => number;
  saveMetadata: (dataset: GribDataset) => void;
}

export function buildNomadsUrl(zone: GribZone, date: string, run: string): string {
  return (
    `https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl` +
    `?file=gfs.t${run}z.pgrb2.0p25.f000` +
    `&var_UGRD=on&var_VGRD=on&var_PRMSL=on` +
    `&lev_10_m_above_ground=on&lev_mean_sea_level=on&subregion=` +
    `&leftlon=${zone.leftlon}&rightlon=${zone.rightlon}` +
    `&toplat=${zone.toplat}&bottomlat=${zone.bottomlat}` +
    `&dir=/gfs.${date}/${run}/atmos`
  );
}

export function getRunCandidates(now = new Date()): RunCandidate[] {
  const availableTime = new Date(now.getTime() - RUN_DELAY_HOURS * 60 * 60 * 1000);
  const candidates: RunCandidate[] = [];
  const firstHour = Math.floor(availableTime.getUTCHours() / 6) * 6;

  for (let index = 0; index < 5; index++) {
    const candidate = new Date(Date.UTC(
      availableTime.getUTCFullYear(),
      availableTime.getUTCMonth(),
      availableTime.getUTCDate(),
      firstHour - index * 6,
    ));
    candidates.push({
      date: candidate.toISOString().slice(0, 10).replace(/-/g, ''),
      hour: candidate.getUTCHours().toString().padStart(2, '0'),
    });
  }
  return candidates;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Erreur inconnue';
}

function slugifyLabel(label: string): string {
  return label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 52) || 'zone-meteo';
}

function report(onProgress: ((message: string) => void) | undefined, message: string) {
  try {
    onProgress?.(message);
  } catch {
    // A progress observer must never change the download transaction.
  }
}

function throwIfCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('Téléchargement annulé');
}

export async function downloadGribWithDependencies<TTarget>(
  zone: GribZone,
  dependencies: DownloadDependencies<TTarget>,
  onProgress?: (message: string) => void,
  signal?: AbortSignal,
): Promise<GribDataset> {
  dependencies.prepare();
  const startedAt = dependencies.now();
  const timestamp = startedAt.getTime();
  let lastError = 'Aucun run NOAA disponible';

  for (const [index, run] of getRunCandidates(startedAt).entries()) {
    throwIfCancelled(signal);
    const id = `${run.date}-${run.hour}-${timestamp}-${index}`;
    const temporary = dependencies.createTemporary(`gribzy-${id}.part`);
    let destination: TTarget | null = null;
    let committed = false;

    try {
      dependencies.removeIfExists(temporary);
      report(onProgress, `Run ${run.date} · ${run.hour}Z…`);
      await dependencies.download(buildNomadsUrl(zone, run.date, run.hour), temporary);
      throwIfCancelled(signal);

      const bytes = await dependencies.readBytes(temporary);
      throwIfCancelled(signal);
      const validated = dependencies.validate(bytes);
      if (!validated.windU || !validated.windV) {
        throw new Error('Vent à 10 m absent de la réponse NOAA');
      }

      const fileName = `${slugifyLabel(zone.label)}-${run.date}-${run.hour}z-${timestamp}.grib2`;
      destination = dependencies.createDestination(fileName);
      dependencies.removeIfExists(destination);
      dependencies.move(temporary, destination);

      const dataset: GribDataset = {
        schemaVersion: 2,
        id,
        fileName,
        zone,
        model: 'GFS',
        resolution: '0.25°',
        parameters: ['pressure', 'wind'],
        forecastHours: [0],
        runDate: run.date,
        runHour: run.hour,
        downloadedAt: timestamp,
        fileSize: dependencies.size(destination),
      };
      dependencies.saveMetadata(dataset);
      committed = true;
      report(onProgress, 'Donnée enregistrée');
      return dataset;
    } catch (error) {
      dependencies.removeIfExists(temporary);
      if (destination && !committed) dependencies.removeIfExists(destination);
      if (signal?.aborted || getErrorMessage(error) === 'Téléchargement annulé') {
        throw new Error('Téléchargement annulé');
      }
      lastError = getErrorMessage(error);
    }
  }

  throw new Error(`Téléchargement impossible. ${lastError}`);
}
