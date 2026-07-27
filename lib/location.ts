import * as Location from 'expo-location';
import { describeLocation } from './geoNames';
import type { AppLanguage } from './i18nCore';

export interface UserLocation {
  lat: number;
  lon: number;
}

function toUserLocation(location: Location.LocationObject): UserLocation {
  return {
    lat: location.coords.latitude,
    lon: location.coords.longitude,
  };
}

export async function getGrantedUserLocation(): Promise<UserLocation | null> {
  const [{ status }, servicesEnabled] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.hasServicesEnabledAsync(),
  ]);
  if (status !== 'granted' || !servicesEnabled) return null;

  const lastKnown = await Location.getLastKnownPositionAsync({
    maxAge: 5 * 60 * 1000,
    requiredAccuracy: 5000,
  });
  if (lastKnown) return toUserLocation(lastKnown);

  return toUserLocation(await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  }));
}

export async function getUserLocation(): Promise<UserLocation> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission denied');
  }

  const lastKnown = await Location.getLastKnownPositionAsync({
    maxAge: 30 * 60 * 1000,
    requiredAccuracy: 10000,
  });
  if (lastKnown) return toUserLocation(lastKnown);

  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Low,
  });

  return toUserLocation(location);
}

export function buildZoneFromLocation(lat: number, lon: number, span = 10, language: AppLanguage = 'en') {
  const halfWidth = span / 2;
  const halfHeight = span / 4;
  return {
    label: describeLocation(lat, lon, language),
    leftlon: Math.round((lon - halfWidth) * 10) / 10,
    rightlon: Math.round((lon + halfWidth) * 10) / 10,
    bottomlat: Math.round((lat - halfHeight) * 10) / 10,
    toplat: Math.round((lat + halfHeight) * 10) / 10,
  };
}
