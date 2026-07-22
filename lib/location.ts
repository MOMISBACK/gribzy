import * as Location from 'expo-location';
import { describeLocation } from './geoNames';
import type { AppLanguage } from './i18nCore';

export interface UserLocation {
  lat: number;
  lon: number;
}

export async function getUserLocation(): Promise<UserLocation> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission denied');
  }

  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  return {
    lat: location.coords.latitude,
    lon: location.coords.longitude,
  };
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
