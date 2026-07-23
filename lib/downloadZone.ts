import { describeLocation } from './geoNames';
import type { AppLanguage } from './i18nCore';
import type { GribZone } from './gribTypes';

const GFS_RESOLUTION = 0.25;
export const MAX_DOWNLOAD_GRID_POINTS = 10_000;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function zoneFromVisibleBounds(
  bounds: [west: number, south: number, east: number, north: number],
  language: AppLanguage,
): GribZone {
  const [rawWest, rawSouth, rawEast, rawNorth] = bounds;
  const west = clamp(rawWest, -180, 180);
  const east = clamp(rawEast, -180, 180);
  const south = clamp(rawSouth, -85, 85);
  const north = clamp(rawNorth, -85, 85);
  const centerLatitude = (south + north) / 2;
  const centerLongitude = (west + east) / 2;

  return {
    label: describeLocation(centerLatitude, centerLongitude, language),
    leftlon: Number(west.toFixed(1)),
    rightlon: Number(east.toFixed(1)),
    bottomlat: Number(south.toFixed(1)),
    toplat: Number(north.toFixed(1)),
  };
}

export function estimateGridPoints(zone: GribZone): number {
  const longitudeSpan = zone.rightlon - zone.leftlon;
  const latitudeSpan = zone.toplat - zone.bottomlat;
  if (longitudeSpan <= 0 || latitudeSpan <= 0) return Infinity;
  return (Math.ceil(longitudeSpan / GFS_RESOLUTION) + 1)
    * (Math.ceil(latitudeSpan / GFS_RESOLUTION) + 1);
}

export function canDownloadVisibleZone(zone: GribZone): boolean {
  return estimateGridPoints(zone) <= MAX_DOWNLOAD_GRID_POINTS;
}
