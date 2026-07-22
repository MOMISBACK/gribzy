import { File, Paths } from 'expo-file-system';
import { useLocales } from 'expo-localization';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { localizeTechnicalMessage, resolveLanguage, type AppLanguage, type LanguagePreference } from './i18nCore';

export { localizeTechnicalMessage, type AppLanguage, type LanguagePreference } from './i18nCore';

const PREFERENCE_FILE = 'gribzy-language.json';

const en = {
  'nav.files': 'Files', 'nav.map': 'Map', 'nav.settings': 'Settings',
  'library.tagline': 'Weather to go', 'library.heroTitle': 'Ready to go?',
  'library.heroText': 'Open a GRIB forecast, even far from the network.',
  'library.open': 'Open a GRIB file', 'library.opening': 'Opening…',
  'library.download': 'Download an area', 'library.recent': 'Recent files',
  'library.emptyTitle': 'No files', 'library.emptyText': 'Open an existing GRIB or download an area to get started.',
  'library.imported': 'Imported', 'library.unknownSource': 'unknown source', 'library.downloaded': 'Downloaded {date}',
  'library.rename': 'Rename', 'library.delete': 'Delete', 'common.cancel': 'Cancel', 'common.save': 'Save',
  'library.deleteTitle': 'Delete this GRIB?', 'library.renameTitle': 'Rename file',
  'error.incompatibleTitle': 'Incompatible file', 'error.open': 'Unable to open this GRIB.',
  'error.invalidName': 'Invalid name', 'error.rename': 'Unable to rename.',
  'select.tagline': 'Choose the area to take with you', 'select.locating': 'Locating…', 'select.myLocation': '⌖ My location',
  'select.offline': 'Offline', 'select.offlineText': 'A connection is required to download. Your saved GRIB files remain available.',
  'select.connectionRequired': 'Connection required', 'select.download': 'Download this area', 'select.connecting': 'Connecting…',
  'select.unknownError': 'An unknown error occurred', 'select.connectionError': 'A connection is required to download a new forecast.',
  'map.loading': 'Loading…', 'map.reading': 'Reading…', 'map.decoding': 'Decoding…', 'map.error': 'Error: {message}',
  'map.unreadable': 'Unreadable data', 'map.noFile': 'No file selected', 'map.notFound': 'Local data not found',
  'map.pressureMissing': 'Pressure message not found', 'map.parameterA11y': 'Choose weather parameter',
  'map.pressure': 'Pressure', 'map.wind': 'Wind', 'map.imported': 'Imported file', 'map.refresh': '↻ refresh',
  'map.layersA11y': 'Display options', 'map.infoA11y': 'File information',
  'map.timelineA11y': 'Available forecast: hour zero', 'map.oneForecast': '1 forecast',
  'map.weatherPoint': 'Weather point', 'map.close': 'Close', 'map.parameter': 'Parameter', 'map.display': 'Display', 'map.file': 'GRIB file',
  'map.knots': 'knots', 'map.showIsobars': 'Show isobars', 'map.showWind': 'Show wind vectors', 'map.detailedMap': 'Detailed map',
  'map.name': 'Name', 'map.model': 'Model', 'map.resolution': 'Resolution', 'map.run': 'Run', 'map.size': 'Size', 'map.area': 'Area',
  'map.unknownOrigin': 'Unknown source',
  'settings.title': 'Settings', 'settings.offlineTitle': 'Designed for offline use',
  'settings.offlineText': 'Your GRIB files stay on this device. No account, cloud, or tracking.',
  'settings.language': 'Language', 'settings.languageDescription': 'App display language',
  'settings.automatic': 'Automatic', 'settings.automaticDetail': 'Phone language: {language}',
  'settings.english': 'English', 'settings.french': 'French', 'settings.units': 'Units',
  'settings.windDescription': 'Speed shown on the map', 'settings.pressureDescription': 'Mean sea-level pressure',
  'settings.temperature': 'Temperature', 'settings.storage': 'Storage', 'settings.offlineFiles': 'Offline files',
  'settings.availableOffline': 'Available without a connection', 'settings.usedSpace': 'Used space',
  'settings.about': 'About', 'settings.version': 'Version', 'settings.account': 'Account and tracking',
  'settings.accountDescription': 'No sign-up, no profiling', 'settings.none': 'None', 'settings.offlineMode': 'Offline mode',
  'settings.included': 'Included', 'settings.hint': 'Units and advanced options will be enabled when they actually affect the display.',
  'gesture.embedded': '1 finger: move · 2 fingers: zoom · tap: select',
  'gesture.online': 'Move the map to position the frame · pinch to zoom',
} as const;

type TranslationKey = keyof typeof en;

const fr: Record<TranslationKey, string> = {
  'nav.files': 'Fichiers', 'nav.map': 'Carte', 'nav.settings': 'Réglages',
  'library.tagline': 'La météo à emporter', 'library.heroTitle': 'Prêt à partir ?',
  'library.heroText': 'Ouvre une prévision GRIB, même loin du réseau.',
  'library.open': 'Ouvrir un fichier GRIB', 'library.opening': 'Ouverture…',
  'library.download': 'Télécharger une zone', 'library.recent': 'Fichiers récents',
  'library.emptyTitle': 'Aucun fichier', 'library.emptyText': 'Ouvre un GRIB existant ou télécharge une zone pour commencer.',
  'library.imported': 'Importé', 'library.unknownSource': 'origine inconnue', 'library.downloaded': 'Téléchargé {date}',
  'library.rename': 'Renommer', 'library.delete': 'Supprimer', 'common.cancel': 'Annuler', 'common.save': 'Enregistrer',
  'library.deleteTitle': 'Supprimer ce GRIB ?', 'library.renameTitle': 'Renommer le fichier',
  'error.incompatibleTitle': 'Fichier incompatible', 'error.open': 'Impossible d’ouvrir ce GRIB.',
  'error.invalidName': 'Nom invalide', 'error.rename': 'Impossible de renommer.',
  'select.tagline': 'Choisis la zone à emporter', 'select.locating': 'Localisation…', 'select.myLocation': '⌖ Ma position',
  'select.offline': 'Hors ligne', 'select.offlineText': 'Connexion requise pour télécharger. Tes GRIB enregistrés restent disponibles.',
  'select.connectionRequired': 'Connexion requise', 'select.download': 'Télécharger cette zone', 'select.connecting': 'Connexion…',
  'select.unknownError': 'Une erreur inconnue est survenue', 'select.connectionError': 'Connexion requise pour télécharger une nouvelle prévision.',
  'map.loading': 'Chargement…', 'map.reading': 'Lecture…', 'map.decoding': 'Décodage…', 'map.error': 'Erreur : {message}',
  'map.unreadable': 'Donnée illisible', 'map.noFile': 'Aucun fichier sélectionné', 'map.notFound': 'Donnée locale introuvable',
  'map.pressureMissing': 'Message pression non trouvé', 'map.parameterA11y': 'Choisir le paramètre météo',
  'map.pressure': 'Pression', 'map.wind': 'Vent', 'map.imported': 'Fichier importé', 'map.refresh': '↻ rafraîchir',
  'map.layersA11y': 'Options d’affichage', 'map.infoA11y': 'Informations du fichier',
  'map.timelineA11y': 'Échéance disponible : heure zéro', 'map.oneForecast': '1 échéance',
  'map.weatherPoint': 'Point météo', 'map.close': 'Fermer', 'map.parameter': 'Paramètre', 'map.display': 'Affichage', 'map.file': 'Fichier GRIB',
  'map.knots': 'nœuds', 'map.showIsobars': 'Afficher les isobares', 'map.showWind': 'Afficher les vecteurs vent', 'map.detailedMap': 'Fond détaillé',
  'map.name': 'Nom', 'map.model': 'Modèle', 'map.resolution': 'Résolution', 'map.run': 'Run', 'map.size': 'Taille', 'map.area': 'Zone',
  'map.unknownOrigin': 'Origine inconnue',
  'settings.title': 'Réglages', 'settings.offlineTitle': 'Pensé pour le hors-ligne',
  'settings.offlineText': 'Tes GRIB restent sur cet appareil. Aucun compte, cloud ou suivi.',
  'settings.language': 'Langue', 'settings.languageDescription': 'Langue d’affichage de l’application',
  'settings.automatic': 'Automatique', 'settings.automaticDetail': 'Langue du téléphone : {language}',
  'settings.english': 'Anglais', 'settings.french': 'Français', 'settings.units': 'Unités',
  'settings.windDescription': 'Vitesse affichée sur la carte', 'settings.pressureDescription': 'Pression au niveau de la mer',
  'settings.temperature': 'Température', 'settings.storage': 'Stockage', 'settings.offlineFiles': 'Fichiers hors ligne',
  'settings.availableOffline': 'Disponibles sans connexion', 'settings.usedSpace': 'Espace utilisé',
  'settings.about': 'À propos', 'settings.version': 'Version', 'settings.account': 'Compte et suivi',
  'settings.accountDescription': 'Aucune inscription, aucun profilage', 'settings.none': 'Aucun', 'settings.offlineMode': 'Mode hors ligne',
  'settings.included': 'Inclus', 'settings.hint': 'Les unités et options avancées seront activées lorsqu’elles modifieront réellement le rendu.',
  'gesture.embedded': '1 doigt : déplacer · 2 doigts : zoomer · toucher : choisir',
  'gesture.online': 'Déplace la carte pour placer le cadre · pince pour zoomer',
};

function loadPreference(): LanguagePreference {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage === 'undefined') return 'auto';
      const stored = localStorage.getItem(PREFERENCE_FILE);
      return stored === 'en' || stored === 'fr' || stored === 'auto' ? stored : 'auto';
    }
    const file = new File(Paths.document, PREFERENCE_FILE);
    if (!file.exists) return 'auto';
    const parsed = JSON.parse(file.textSync()) as { language?: unknown };
    return parsed.language === 'en' || parsed.language === 'fr' || parsed.language === 'auto' ? parsed.language : 'auto';
  } catch { return 'auto'; }
}

function savePreference(language: LanguagePreference) {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(PREFERENCE_FILE, language);
    return;
  }
  const file = new File(Paths.document, PREFERENCE_FILE);
  file.create({ overwrite: true, intermediates: true });
  file.write(JSON.stringify({ language }));
}

function interpolate(template: string, values?: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values?.[key] ?? `{${key}}`));
}

interface I18nValue {
  language: AppLanguage;
  preference: LanguagePreference;
  setPreference: (preference: LanguagePreference) => void;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const locales = useLocales();
  const [preference, setPreferenceState] = useState<LanguagePreference>(loadPreference);
  const language = resolveLanguage(preference, locales[0]?.languageCode);
  const value = useMemo<I18nValue>(() => ({
    language,
    preference,
    setPreference: (next) => { setPreferenceState(next); savePreference(next); },
    t: (key, values) => interpolate((language === 'fr' ? fr : en)[key], values),
  }), [language, preference]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}
