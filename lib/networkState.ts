export interface NetworkStateLike {
  isConnected?: boolean;
  isInternetReachable?: boolean;
}

export type NetworkAvailability = 'online' | 'offline' | 'unknown';

export function getNetworkAvailability(state: NetworkStateLike): NetworkAvailability {
  if (state.isConnected === false || state.isInternetReachable === false) return 'offline';
  if (state.isInternetReachable === true || state.isConnected === true) return 'online';
  return 'unknown';
}
