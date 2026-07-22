import type { AppLanguage } from './i18nCore';

interface NamedArea { en: string; fr: string; west: number; east: number; south: number; north: number }

const AREAS: NamedArea[] = [
  { en: 'Brittany', fr: 'Bretagne', west: -6, east: -1, south: 47, north: 49.5 },
  { en: 'Alps', fr: 'Alpes', west: 5, east: 16, south: 43, north: 48.5 },
  { en: 'Pyrenees', fr: 'Pyrénées', west: -2.5, east: 3.5, south: 42, north: 43.8 },
  { en: 'Corsica', fr: 'Corse', west: 8.4, east: 9.7, south: 41.2, north: 43.1 },
  { en: 'France', fr: 'France', west: -5.5, east: 8.5, south: 42, north: 51.5 },
  { en: 'British Isles', fr: 'Îles Britanniques', west: -11, east: 3, south: 49, north: 60 },
  { en: 'Iberian Peninsula', fr: 'Péninsule ibérique', west: -10, east: 4.5, south: 35.5, north: 44 },
  { en: 'Scandinavia', fr: 'Scandinavie', west: 4, east: 32, south: 54, north: 72 },
  { en: 'Mediterranean', fr: 'Méditerranée', west: -6, east: 37, south: 30, north: 46 },
  { en: 'Central Europe', fr: 'Europe centrale', west: 3, east: 25, south: 45, north: 55 },
  { en: 'Caribbean', fr: 'Caraïbes', west: -90, east: -58, south: 8, north: 28 },
  { en: 'North America', fr: 'Amérique du Nord', west: -170, east: -50, south: 15, north: 72 },
  { en: 'South America', fr: 'Amérique du Sud', west: -82, east: -34, south: -56, north: 13 },
  { en: 'Africa', fr: 'Afrique', west: -18, east: 52, south: -35, north: 37 },
  { en: 'Middle East', fr: 'Moyen-Orient', west: 25, east: 65, south: 12, north: 42 },
  { en: 'Central Asia', fr: 'Asie centrale', west: 45, east: 95, south: 30, north: 58 },
  { en: 'East Asia', fr: 'Asie de l’Est', west: 95, east: 150, south: 18, north: 58 },
  { en: 'Southeast Asia', fr: 'Asie du Sud-Est', west: 90, east: 145, south: -12, north: 25 },
  { en: 'Oceania', fr: 'Océanie', west: 110, east: 180, south: -50, north: 0 },
  { en: 'North Atlantic', fr: 'Atlantique Nord', west: -80, east: 15, south: 20, north: 70 },
  { en: 'South Atlantic', fr: 'Atlantique Sud', west: -70, east: 20, south: -60, north: 20 },
  { en: 'Pacific', fr: 'Pacifique', west: -180, east: 180, south: -60, north: 60 },
  { en: 'Arctic', fr: 'Arctique', west: -180, east: 180, south: 70, north: 90 },
  { en: 'Southern Ocean', fr: 'Océan Austral', west: -180, east: 180, south: -90, north: -60 },
];

export function formatCoordinates(latitude: number, longitude: number): string {
  return `${Math.abs(latitude).toFixed(1)}°${latitude >= 0 ? 'N' : 'S'}, ${Math.abs(longitude).toFixed(1)}°${longitude >= 0 ? 'E' : 'W'}`;
}

export function describeLocation(latitude: number, longitude: number, language: AppLanguage = 'en'): string {
  const area = AREAS.find(({ west, east, south, north }) => longitude >= west && longitude <= east && latitude >= south && latitude <= north);
  return `${area?.[language] ?? (language === 'fr' ? 'Zone météo' : 'Weather area')} · ${formatCoordinates(latitude, longitude)}`;
}
