export interface GribZone {
  leftlon: number;
  rightlon: number;
  bottomlat: number;
  toplat: number;
  label: string;
}
export type GribParameterId = 'pressure' | 'wind' | 'temperature' | 'rain';

export interface ForecastFrameDescriptor {
  forecastHour: number;
  validTime: string;
  sourceId: string;
  sourceFileId: string;
  messageIndexes?: number[];
}

export interface GribDataset {
  schemaVersion: 3;
  id: string;
  /** Compatibility entry point: physical file of the first frame. */
  fileName: string;
  sourceId: string;
  frames: ForecastFrameDescriptor[];
  zone: GribZone;
  model: string;
  resolution: string;
  parameters: GribParameterId[];
  forecastHours: number[];
  runDate: string;
  runHour: string;
  downloadedAt: number;
  fileSize: number;
}
