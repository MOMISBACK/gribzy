import { ZonePickerMap } from '@/components/zone-picker-map';
import { AppTabBar } from '@/components/app-tab-bar';
import { downloadGrib } from '@/lib/gribDownload';
import type { GribZone } from '@/lib/gribTypes';
import { buildZoneFromLocation, getGrantedUserLocation, getUserLocation, type UserLocation } from '@/lib/location';
import { getNetworkAvailability } from '@/lib/networkState';
import { localizeTechnicalMessage, useI18n } from '@/lib/i18n';
import { SpaceMono_400Regular, SpaceMono_700Bold, useFonts } from '@expo-google-fonts/space-mono';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useNetworkState } from 'expo-network';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { canDownloadVisibleZone } from '@/lib/downloadZone';

const DEFAULT_ZONE: GribZone = { label: 'Brittany', leftlon: -8, rightlon: 2, bottomlat: 45.5, toplat: 50.5 };

function formatCenter(zone: GribZone) {
  const latitude = (zone.bottomlat + zone.toplat) / 2;
  const longitude = (zone.leftlon + zone.rightlon) / 2;
  return `${Math.abs(latitude).toFixed(2)}° ${latitude >= 0 ? 'N' : 'S'} · ${Math.abs(longitude).toFixed(2)}° ${longitude >= 0 ? 'E' : 'W'}`;
}

export default function SelectScreen() {
  const { language, t } = useI18n();
  const errorMessage = (error: unknown) => error instanceof Error ? localizeTechnicalMessage(error.message, language) : t('select.unknownError');
  const [fontsLoaded] = useFonts({ SpaceMono_400Regular, SpaceMono_700Bold });
  const insets = useSafeAreaInsets();
  const networkState = useNetworkState();
  const networkAvailability = getNetworkAvailability(networkState);
  const isOffline = networkAvailability === 'offline';
  const [zone, setZone] = useState(DEFAULT_ZONE);
  const [mapFocusRequest, setMapFocusRequest] = useState(0);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [busy, setBusy] = useState<'download' | 'location' | null>(null);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const zoneIsDownloadable = canDownloadVisibleZone(zone);

  const focusLocation = (location: UserLocation) => {
    setUserLocation(location);
    setZone(buildZoneFromLocation(location.lat, location.lon, 10, language));
    setMapFocusRequest((request) => request + 1);
  };

  useEffect(() => {
    let active = true;
    void getGrantedUserLocation()
      .then((location) => {
        if (active) setUserLocation(location);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const locate = async () => {
    setBusy('location');
    setError(null);
    if (userLocation) focusLocation(userLocation);
    try {
      focusLocation(await getUserLocation());
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  const download = async () => {
    if (isOffline) {
      setError(t('select.connectionError'));
      return;
    }
    setBusy('download');
    setError(null);
    try {
      const dataset = await downloadGrib(zone, (message) => setProgress(localizeTechnicalMessage(message, language)));
      router.push({ pathname: '/map', params: { file: dataset.fileName } });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
      setProgress('');
    }
  };

  if (!fontsLoaded) return <View style={styles.container} />;

  return (
    <View style={styles.container}>
      <View style={styles.mapStage}>
        <ZonePickerMap zone={zone} focusRequest={mapFocusRequest} userLocation={userLocation} onChange={setZone} />
        <Pressable
          style={[styles.locationButton, { top: insets.top + 12 }]}
          onPress={locate}
          disabled={busy !== null}
          accessibilityRole="button"
          accessibilityLabel={busy === 'location' ? t('select.locating') : t('select.myLocation')}
        >
          {busy === 'location'
            ? <ActivityIndicator size="small" color="#1967D2" />
            : <MaterialIcons name="my-location" size={24} color="#1967D2" />}
        </Pressable>
        <View style={[styles.bottomSheet, { bottom: 88 + insets.bottom }]}>
          <View style={styles.zoneControls}>
            <View style={styles.zoneCopy}>
              <Text style={styles.zoneEyebrow}>{t('select.selectedArea')}</Text>
              <Text style={styles.zoneName}>{formatCenter(zone)}</Text>
              <View style={styles.forecastMeta}><Text style={styles.forecastMetaLabel}>{t('map.model')}</Text><Text style={styles.forecastMetaValue}>GFS · 0.25°</Text></View>
            </View>
          </View>
          {!zoneIsDownloadable && !isOffline && <View style={styles.zoomBox}><Text style={styles.zoomText}>{t('select.zoomInDetail')}</Text></View>}
          {isOffline && <View style={styles.offlineBox}><Text style={styles.offlineTitle}>{t('select.offline')}</Text><Text style={styles.offlineText}>{t('select.offlineText')}</Text></View>}
          {error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}
          <Pressable style={[styles.download, (busy !== null || isOffline || !zoneIsDownloadable) && styles.disabled]} disabled={busy !== null || isOffline || !zoneIsDownloadable} onPress={download} accessibilityRole="button" accessibilityState={{ disabled: busy !== null || isOffline || !zoneIsDownloadable }}>
            {busy === 'download' ? <><ActivityIndicator color="#FFFFFF"/><Text style={styles.downloadText}>{progress || t('select.connecting')}</Text></> : <Text style={styles.downloadText}>{isOffline ? t('select.connectionRequired') : !zoneIsDownloadable ? t('select.zoomIn') : t('select.download')}</Text>}
          </Pressable>
        </View>
      </View>
      <AppTabBar active="files" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F2EA' },
  mapStage: { flex: 1 },
  locationButton: { position: 'absolute', top: 52, right: 14, width: 50, height: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.96)', shadowColor: '#17324D', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  bottomSheet: { position: 'absolute', left: 12, right: 12, backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 24, padding: 15, shadowColor: '#17324D', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
  zoneControls: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 }, zoneCopy: { flex: 1 }, zoneEyebrow: { color: '#1967D2', fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }, zoneName: { color: '#17324D', fontSize: 18, fontWeight: '800', marginTop: 4, fontFamily: 'SpaceMono_700Bold' }, forecastMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }, forecastMetaLabel: { color: '#87919C', fontSize: 11 }, forecastMetaValue: { color: '#405465', fontSize: 12, fontWeight: '700' },
  download: { minHeight: 48, borderRadius: 13, backgroundColor: '#2474E5', flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center' }, downloadText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' }, disabled: { opacity: 0.55 }, zoomBox: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 9, backgroundColor: '#FFF3E0' }, zoomText: { color: '#8A4B08', fontSize: 11, lineHeight: 16 }, offlineBox: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 9, backgroundColor: '#E8F0FE' }, offlineTitle: { color: '#174EA6', fontSize: 13, fontWeight: '800' }, offlineText: { color: '#3C5F8A', fontSize: 11, lineHeight: 16, marginTop: 2 }, errorBox: { borderLeftWidth: 3, borderLeftColor: '#D33C32', borderRadius: 9, padding: 9, marginBottom: 9, backgroundColor: '#FDEAE7' }, errorText: { color: '#9D2720', fontSize: 12 },
});
