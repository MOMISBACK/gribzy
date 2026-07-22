import { describe, expect, it } from 'vitest';

import { localizeTechnicalMessage, resolveLanguage } from './i18nCore';

describe('resolveLanguage', () => {
  it('uses French for a French phone in automatic mode', () => {
    expect(resolveLanguage('auto', 'fr')).toBe('fr');
  });

  it('falls back to English for every other phone language', () => {
    expect(resolveLanguage('auto', 'de')).toBe('en');
    expect(resolveLanguage('auto', null)).toBe('en');
  });

  it('keeps an explicit choice regardless of the phone language', () => {
    expect(resolveLanguage('en', 'fr')).toBe('en');
    expect(resolveLanguage('fr', 'en')).toBe('fr');
  });
});

describe('localizeTechnicalMessage', () => {
  it('keeps the English technical source unchanged by default', () => {
    expect(localizeTechnicalMessage('Download cancelled', 'en')).toBe('Download cancelled');
  });

  it('localizes known French messages and download prefixes', () => {
    expect(localizeTechnicalMessage('Download cancelled', 'fr')).toBe('Téléchargement annulé');
    expect(localizeTechnicalMessage('Download failed. No NOAA run available', 'fr'))
      .toBe('Téléchargement impossible. Aucun run NOAA disponible');
  });
});
