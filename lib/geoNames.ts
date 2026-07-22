interface NamedArea { name: string; west: number; east: number; south: number; north: number }

const AREAS: NamedArea[] = [
  { name: 'Bretagne', west: -6, east: -1, south: 47, north: 49.5 },
  { name: 'Alpes', west: 5, east: 16, south: 43, north: 48.5 },
  { name: 'Pyrénées', west: -2.5, east: 3.5, south: 42, north: 43.8 },
  { name: 'Corse', west: 8.4, east: 9.7, south: 41.2, north: 43.1 },
  { name: 'France', west: -5.5, east: 8.5, south: 42, north: 51.5 },
  { name: 'Îles Britanniques', west: -11, east: 3, south: 49, north: 60 },
  { name: 'Péninsule ibérique', west: -10, east: 4.5, south: 35.5, north: 44 },
  { name: 'Scandinavie', west: 4, east: 32, south: 54, north: 72 },
  { name: 'Méditerranée', west: -6, east: 37, south: 30, north: 46 },
  { name: 'Europe centrale', west: 3, east: 25, south: 45, north: 55 },
  { name: 'Caraïbes', west: -90, east: -58, south: 8, north: 28 },
  { name: 'Amérique du Nord', west: -170, east: -50, south: 15, north: 72 },
  { name: 'Amérique du Sud', west: -82, east: -34, south: -56, north: 13 },
  { name: 'Afrique', west: -18, east: 52, south: -35, north: 37 },
  { name: 'Moyen-Orient', west: 25, east: 65, south: 12, north: 42 },
  { name: 'Asie centrale', west: 45, east: 95, south: 30, north: 58 },
  { name: 'Asie de l’Est', west: 95, east: 150, south: 18, north: 58 },
  { name: 'Asie du Sud-Est', west: 90, east: 145, south: -12, north: 25 },
  { name: 'Océanie', west: 110, east: 180, south: -50, north: 0 },
  { name: 'Atlantique Nord', west: -80, east: 15, south: 20, north: 70 },
  { name: 'Atlantique Sud', west: -70, east: 20, south: -60, north: 20 },
  { name: 'Pacifique', west: -180, east: 180, south: -60, north: 60 },
  { name: 'Arctique', west: -180, east: 180, south: 70, north: 90 },
  { name: 'Océan Austral', west: -180, east: 180, south: -90, north: -60 },
];

export function formatCoordinates(latitude: number, longitude: number): string {
  return `${Math.abs(latitude).toFixed(1)}°${latitude >= 0 ? 'N' : 'S'}, ${Math.abs(longitude).toFixed(1)}°${longitude >= 0 ? 'E' : 'O'}`;
}

export function describeLocation(latitude: number, longitude: number): string {
  const area = AREAS.find(({ west, east, south, north }) => longitude >= west && longitude <= east && latitude >= south && latitude <= north);
  return `${area?.name ?? 'Zone météo'} · ${formatCoordinates(latitude, longitude)}`;
}
