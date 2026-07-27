import type { ForecastFrameDescriptor, GribDataset, GribZone } from './gribTypes';

const RUN_DELAY_HOURS = 6;
export const FORECAST_HOURS = [0, 3, 6, 9, 12, 15, 18, 21, 24] as const;

export interface RunCandidate {
  date: string;
  hour: string;
}

interface ValidatedDownload {
  pressure?: unknown;
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
  validate: (bytes: Uint8Array, forecastHour: number, validTime: string) => ValidatedDownload;
  move: (source: TTarget, destination: TTarget) => void;
  size: (target: TTarget) => number;
  saveMetadata: (dataset: GribDataset) => void;
}

export function buildNomadsUrl(
  zone: GribZone,
  date: string,
  run: string,
  forecastHour = 0
): string {
  const forecast = forecastHour.toString().padStart(3, '0');
  return (
    `https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl` +
    `?file=gfs.t${run}z.pgrb2.0p25.f${forecast}` +
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
  return error instanceof Error ? error.message : 'Unknown error';
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
  if (signal?.aborted) throw new Error('Download cancelled');
}

function runStart(run: RunCandidate): Date {
  return new Date(Date.UTC(
    Number(run.date.slice(0, 4)),
    Number(run.date.slice(4, 6)) - 1,
    Number(run.date.slice(6, 8)),
    Number(run.hour),
  ));
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
  let lastError = 'No NOAA run available';

  for (const [runIndex, run] of getRunCandidates(startedAt).entries()) {
    throwIfCancelled(signal);
    const sourceId = `${run.date}-${run.hour}-${timestamp}-${runIndex}`;
    const temporaries: TTarget[] = [];
    const destinations: TTarget[] = [];
    const descriptors: ForecastFrameDescriptor[] = [];
    let committed = false;

    try {
      let totalSize = 0;
      for (const [frameIndex, forecastHour] of FORECAST_HOURS.entries()) {
        throwIfCancelled(signal);
        report(onProgress, `H+${forecastHour} · ${frameIndex + 1}/${FORECAST_HOURS.length}`);
        const suffix = `f${forecastHour.toString().padStart(3, '0')}`;
        const temporary = dependencies.createTemporary(`gribzy-${sourceId}-${suffix}.part`);
        dependencies.removeIfExists(temporary);
        temporaries.push(temporary);
        await dependencies.download(buildNomadsUrl(zone, run.date, run.hour, forecastHour), temporary);
        throwIfCancelled(signal);
        const validTime = new Date(runStart(run).getTime() + forecastHour * 60 * 60 * 1000).toISOString();
        const validated = dependencies.validate(await dependencies.readBytes(temporary), forecastHour, validTime);
        const hasPressure = !!validated.pressure;
        const hasWind = !!validated.windU && !!validated.windV;
        if (!hasPressure && !hasWind) throw new Error(`No usable weather layer at H+${forecastHour}`);
        if (!!validated.windU !== !!validated.windV) {
          // The frame remains usable when pressure exists; wind availability is diagnosed while decoding.
          if (!hasPressure) throw new Error(`Incomplete wind components at H+${forecastHour}`);
        }
        const fileName = `${slugifyLabel(zone.label)}-${run.date}-${run.hour}z-${suffix}-${timestamp}.grib2`;
        const destination = dependencies.createDestination(fileName);
        dependencies.removeIfExists(destination);
        destinations.push(destination);
        totalSize += dependencies.size(temporary);
        descriptors.push({
          forecastHour,
          validTime,
          sourceId,
          sourceFileId: fileName,
        });
      }

      throwIfCancelled(signal);
      temporaries.forEach((temporary, index) => dependencies.move(temporary, destinations[index]));
      const dataset: GribDataset = {
        schemaVersion: 3,
        id: sourceId,
        fileName: descriptors[0].sourceFileId,
        sourceId,
        frames: descriptors,
        zone,
        model: 'GFS',
        resolution: '0.25°',
        parameters: ['pressure', 'wind'],
        forecastHours: [...FORECAST_HOURS],
        runDate: run.date,
        runHour: run.hour,
        downloadedAt: timestamp,
        fileSize: totalSize,
      };
      dependencies.saveMetadata(dataset);
      committed = true;
      report(onProgress, 'Data saved');
      return dataset;
    } catch (error) {
      temporaries.forEach(target => dependencies.removeIfExists(target));
      if (!committed) destinations.forEach(target => dependencies.removeIfExists(target));
      if (signal?.aborted || getErrorMessage(error) === 'Download cancelled') {
        throw new Error('Download cancelled');
      }
      lastError = getErrorMessage(error);
    }
  }
  throw new Error(`Download failed. ${lastError}`);
}
