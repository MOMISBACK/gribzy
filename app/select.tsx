import { ZonePickerMap } from '@/components/zone-picker-map';
import { AppTabBar } from '@/components/app-tab-bar';
import { downloadGrib } from '@/lib/gribDownload';
import type { GribZone } from '@/lib/gribTypes';
import { buildZoneFromLocation, getUserLocation } from '@/lib/location';
import { getNetworkAvailability } from '@/lib/networkState';
import { localizeTechnicalMessage, useI18n } from '@/lib/i18n';
import { SpaceMono_400Regular, SpaceMono_700Bold, useFonts } from '@expo-google-fonts/space-mono';
import { useNetworkState } from 'expo-network';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { canDownloadVisibleZone } from '@/lib/downloadZone';

const DEFAULT_ZONE: GribZone = { label: 'Brittany', leftlon: -8, rightlon: 2, bottomlat: 45.5, toplat: 50.5 };

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
  const [busy, setBusy] = useState<'download' | 'location' | null>(null);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const zoneIsDownloadable = canDownloadVisibleZone(zone);

  const locate = async () => {
    setBusy('location');
    setError(null);
    try {
      const { lat, lon } = await getUserLocation();
      const localZone = buildZoneFromLocation(lat, lon, 10, language);
      setZone(localZone);
      setMapFocusRequest((request) => request + 1);
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
        <ZonePickerMap zone={zone} focusRequest={mapFocusRequest} onChange={setZone} />
        <View style={styles.topBar}>
          <View><Text style={styles.brand}>Gribzy</Text><Text style={styles.tagline}>{t('select.tagline')}</Text></View>
          <Pressable style={styles.locationButton} onPress={locate} disabled={busy !== null} accessibilityRole="button">
            <Text style={styles.location}>{busy === 'location' ? t('select.locating') : t('select.myLocation')}</Text>
          </Pressable>
        </View>
        <View style={[styles.bottomSheet, { bottom: 88 + insets.bottom }]}>
          <View style={styles.zoneControls}>
            <View style={styles.zoneCopy}><Text style={styles.zoneName} numberOfLines={1}>{zone.label}</Text><Text style={styles.coords}>{zone.bottomlat}° / {zone.toplat}° · {zone.leftlon}° / {zone.rightlon}°</Text><Text style={styles.visibleArea}>{t('select.visibleArea')}</Text></View>
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
  topBar: { position: 'absolute', top: 52, left: 14, right: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 17, paddingHorizontal: 14, paddingVertical: 8, shadowColor: '#17324D', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  brand: { color: '#17324D', fontSize: 22, fontWeight: '800' }, tagline: { color: '#71808A', fontSize: 11, marginTop: 1 }, locationButton: { backgroundColor: '#E7F0FF', borderRadius: 11, paddingHorizontal: 11, paddingVertical: 9 }, location: { color: '#1264D3', fontSize: 12, fontWeight: '700' },
  bottomSheet: { position: 'absolute', left: 12, right: 12, backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 20, padding: 12, shadowColor: '#17324D', shadowOpacity: 0.14, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 5 },
  zoneControls: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 }, zoneCopy: { flex: 1 }, zoneName: { color: '#17324D', fontSize: 14, fontWeight: '700' }, coords: { color: '#667887', fontSize: 9, marginTop: 3, fontFamily: 'SpaceMono_400Regular' }, visibleArea: { color: '#1967D2', fontSize: 10, fontWeight: '700', marginTop: 5 },
  download: { minHeight: 48, borderRadius: 13, backgroundColor: '#2474E5', flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center' }, downloadText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' }, disabled: { opacity: 0.55 }, zoomBox: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 9, backgroundColor: '#FFF3E0' }, zoomText: { color: '#8A4B08', fontSize: 11, lineHeight: 16 }, offlineBox: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 9, backgroundColor: '#E8F0FE' }, offlineTitle: { color: '#174EA6', fontSize: 13, fontWeight: '800' }, offlineText: { color: '#3C5F8A', fontSize: 11, lineHeight: 16, marginTop: 2 }, errorBox: { borderLeftWidth: 3, borderLeftColor: '#D33C32', borderRadius: 9, padding: 9, marginBottom: 9, backgroundColor: '#FDEAE7' }, errorText: { color: '#9D2720', fontSize: 12 },
});
