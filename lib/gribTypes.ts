export interface GribZone {
  leftlon: number;
  rightlon: number;
  bottomlat: number;
  toplat: number;
  label: string;
}
export type GribParameterId = 'pressure' | 'wind' | 'temperature' | 'rain';

export interface GribDataset {
  schemaVersion: 2;
  id: string;
  fileName: string;
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
