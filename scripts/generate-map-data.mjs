// Regenerates the embedded map from Natural Earth 1:110m countries GeoJSON.
// Usage: node scripts/generate-map-data.mjs /path/to/ne_110m_admin_0_countries.geojson
import fs from 'node:fs';

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('GeoJSON source path is required');

const domain = { west: -180, east: 180, south: -85, north: 85 };
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

function clipAgainst(points, inside, intersect) {
  const output = [];
  for (let index = 0; index < points.length; index++) {
    const current = points[index];
    const previous = points[(index + points.length - 1) % points.length];
    const currentInside = inside(current);
    const previousInside = inside(previous);
    if (currentInside) {
      if (!previousInside) output.push(intersect(previous, current));
      output.push(current);
    } else if (previousInside) {
      output.push(intersect(previous, current));
    }
  }
  return output;
}

function clipRing(ring) {
  let points = ring;
  points = clipAgainst(points, ([x]) => x >= domain.west, (a, b) => [domain.west, a[1] + ((b[1] - a[1]) * (domain.west - a[0])) / (b[0] - a[0])]);
  points = clipAgainst(points, ([x]) => x <= domain.east, (a, b) => [domain.east, a[1] + ((b[1] - a[1]) * (domain.east - a[0])) / (b[0] - a[0])]);
  points = clipAgainst(points, ([, y]) => y >= domain.south, (a, b) => [a[0] + ((b[0] - a[0]) * (domain.south - a[1])) / (b[1] - a[1]), domain.south]);
  points = clipAgainst(points, ([, y]) => y <= domain.north, (a, b) => [a[0] + ((b[0] - a[0]) * (domain.north - a[1])) / (b[1] - a[1]), domain.north]);
  return points.length >= 3
    ? points.map(([longitude, latitude]) => [Number(longitude.toFixed(3)), Number(latitude.toFixed(3))])
    : null;
}

const rings = source.features.flatMap(({ geometry }) => {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.flatMap((polygon) => polygon.map(clipRing).filter(Boolean));
});

const output = `// Generated from Natural Earth ne_110m_admin_0_countries.geojson (public domain).\nexport const WORLD_LAND_RINGS: readonly (readonly (readonly [number, number])[])[] = ${JSON.stringify(rings)};\n`;
fs.mkdirSync('assets/map', { recursive: true });
fs.writeFileSync('assets/map/world-land.ts', output);
