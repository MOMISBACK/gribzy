export type AppLanguage = 'en' | 'fr';
export type LanguagePreference = 'auto' | AppLanguage;

export function resolveLanguage(preference: LanguagePreference, phoneLanguageCode: string | null | undefined): AppLanguage {
  if (preference === 'en' || preference === 'fr') return preference;
  return phoneLanguageCode?.toLowerCase() === 'fr' ? 'fr' : 'en';
}

const TECHNICAL_FR: Record<string, string> = {
  'Location permission denied': 'Permission de localisation refusée',
  'The file exceeds the 100 MB limit.': 'Le fichier dépasse la limite de 100 Mo.',
  'The name cannot be empty.': 'Le nom ne peut pas être vide.',
  'The name is limited to 80 characters.': 'Le nom est limité à 80 caractères.',
  'The GRIB file cannot be found.': 'Le fichier GRIB est introuvable.',
  'A file already has this name.': 'Un fichier porte déjà ce nom.',
  'Download cancelled': 'Téléchargement annulé',
  'No NOAA run available': 'Aucun run NOAA disponible',
  '10 m wind is missing from the NOAA response': 'Vent à 10 m absent de la réponse NOAA',
  'Data saved': 'Donnée enregistrée',
  'No valid GRIB2 message': 'Aucun message GRIB2 valide',
  'Mean sea-level pressure is missing': 'Pression au niveau de la mer absente',
  'Incomplete wind components': 'Composantes du vent incomplètes',
  'Truncated GRIB data': 'Données GRIB tronquées',
};

export function localizeTechnicalMessage(message: string, language: AppLanguage): string {
  if (language === 'en') return message;
  if (TECHNICAL_FR[message]) return TECHNICAL_FR[message];
  if (message.startsWith('Download failed. ')) {
    return `Téléchargement impossible. ${localizeTechnicalMessage(message.slice(17), language)}`;
  }
  return message;
}
