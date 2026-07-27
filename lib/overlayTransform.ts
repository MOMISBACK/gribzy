export type MapBounds = [west: number, south: number, east: number, north: number];

export interface OverlayTransform {
  translateX: number;
  translateY: number;
  scaleX: number;
  scaleY: number;
}

const MAX_MERCATOR_LATITUDE = 85.05112878;

function mercatorLatitude(latitude: number) {
  const clamped = Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, latitude));
  return Math.log(Math.tan(Math.PI / 4 + clamped * Math.PI / 360));
}

export function computeOverlayTransform(previous: MapBounds, next: MapBounds, width: number, height: number): OverlayTransform | null {
  const previousLongitudeSpan = previous[2] - previous[0];
  const nextLongitudeSpan = next[2] - next[0];
  const previousTop = mercatorLatitude(previous[3]);
  const previousBottom = mercatorLatitude(previous[1]);
  const nextTop = mercatorLatitude(next[3]);
  const nextBottom = mercatorLatitude(next[1]);
  const previousLatitudeSpan = previousTop - previousBottom;
  const nextLatitudeSpan = nextTop - nextBottom;

  if (
    previousLongitudeSpan <= 0
    || nextLongitudeSpan <= 0
    || previousLatitudeSpan <= 0
    || nextLatitudeSpan <= 0
    || width <= 0
    || height <= 0
  ) return null;

  return {
    scaleX: previousLongitudeSpan / nextLongitudeSpan,
    scaleY: previousLatitudeSpan / nextLatitudeSpan,
    translateX: (previous[0] - next[0]) / nextLongitudeSpan * width,
    translateY: (nextTop - previousTop) / nextLatitudeSpan * height,
  };
}
