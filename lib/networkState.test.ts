import { describe, expect, it } from 'vitest';

import { getNetworkAvailability } from './networkState';

describe('getNetworkAvailability', () => {
  it('reste inconnu avant la première mesure', () => {
    expect(getNetworkAvailability({})).toBe('unknown');
  });

  it('détecte une connexion utilisable', () => {
    expect(getNetworkAvailability({ isConnected: true, isInternetReachable: true })).toBe('online');
    expect(getNetworkAvailability({ isConnected: true })).toBe('online');
  });

  it('considère toute absence confirmée comme hors ligne', () => {
    expect(getNetworkAvailability({ isConnected: false })).toBe('offline');
    expect(getNetworkAvailability({ isConnected: true, isInternetReachable: false })).toBe('offline');
  });
});
