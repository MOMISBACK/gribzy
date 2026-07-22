import { ZonePickerMap } from '@/components/zone-picker-map';
import { AppTabBar } from '@/components/app-tab-bar';
import { downloadGrib } from '@/lib/gribDownload';
import type { GribZone } from '@/lib/gribTypes';
import { buildZoneFromLocation, getUserLocation } from '@/lib/location';
import { getNetworkAvailability } from '@/lib/networkState';
import { SpaceMono_400Regular, SpaceMono_700Bold, useFonts } from '@expo-google-fonts/space-mono';
import { useNetworkState } from 'expo-network';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

const DEFAULT_ZONE: GribZone = { label: 'Bretagne', leftlon: -8, rightlon: 2, bottomlat: 45.5, toplat: 50.5 };
const SPANS = [6, 10, 20];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Une erreur inconnue est survenue';
}

export default function SelectScreen() {
  const [fontsLoaded] = useFonts({ SpaceMono_400Regular, SpaceMono_700Bold });
  const networkState = useNetworkState();
  const networkAvailability = getNetworkAvailability(networkState);
  const isOffline = networkAvailability === 'offline';
  const [zone, setZone] = useState(DEFAULT_ZONE);
  const [span, setSpan] = useState(10);
  const [mapFocusRequest, setMapFocusRequest] = useState(0);
  const [busy, setBusy] = useState<'download' | 'location' | null>(null);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const resizeZone = (nextSpan: number) => {
    const centerLon = (zone.leftlon + zone.rightlon) / 2;
    const centerLat = (zone.bottomlat + zone.toplat) / 2;
    setSpan(nextSpan);
    setZone({ ...zone, leftlon: centerLon - nextSpan / 2, rightlon: centerLon + nextSpan / 2, bottomlat: centerLat - nextSpan / 4, toplat: centerLat + nextSpan / 4 });
  };

  const locate = async () => {
    setBusy('location');
    setError(null);
    try {
      const { lat, lon } = await getUserLocation();
      const localZone = buildZoneFromLocation(lat, lon, span);
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
      setError('Connexion requise pour télécharger une nouvelle prévision.');
      return;
    }
    setBusy('download');
    setError(null);
    try {
      const dataset = await downloadGrib(zone, setProgress);
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
        <ZonePickerMap zone={zone} span={span} focusRequest={mapFocusRequest} onChange={setZone} />
        <View style={styles.topBar}>
          <View><Text style={styles.brand}>Gribzy</Text><Text style={styles.tagline}>Choisis la zone à emporter</Text></View>
          <Pressable style={styles.locationButton} onPress={locate} disabled={busy !== null} accessibilityRole="button">
            <Text style={styles.location}>{busy === 'location' ? 'Localisation…' : '⌖ Ma position'}</Text>
          </Pressable>
        </View>
        <View style={styles.bottomSheet}>
          <View style={styles.zoneControls}>
            <View style={styles.zoneCopy}><Text style={styles.zoneName} numberOfLines={1}>{zone.label}</Text><Text style={styles.coords}>{zone.bottomlat}°–{zone.toplat}°N  {zone.leftlon}°–{zone.rightlon}°</Text></View>
            <View style={styles.spans}>{SPANS.map((value) => <Pressable key={value} onPress={() => resizeZone(value)} style={[styles.span, span === value && styles.spanActive]}><Text style={[styles.spanText, span === value && styles.spanTextActive]}>{value}°</Text></Pressable>)}</View>
          </View>
          {isOffline && <View style={styles.offlineBox}><Text style={styles.offlineTitle}>Hors ligne</Text><Text style={styles.offlineText}>Connexion requise pour télécharger. Tes GRIB enregistrés restent disponibles.</Text></View>}
          {error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}
          <Pressable style={[styles.download, (busy !== null || isOffline) && styles.disabled]} disabled={busy !== null || isOffline} onPress={download} accessibilityRole="button" accessibilityState={{ disabled: busy !== null || isOffline }}>
            {busy === 'download' ? <><ActivityIndicator color="#FFFFFF"/><Text style={styles.downloadText}>{progress || 'Connexion…'}</Text></> : <Text style={styles.downloadText}>{isOffline ? 'Connexion requise' : 'Télécharger cette zone'}</Text>}
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
  bottomSheet: { position: 'absolute', left: 12, right: 12, bottom: 90, backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 20, padding: 12, shadowColor: '#17324D', shadowOpacity: 0.14, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 5 },
  zoneControls: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 }, zoneCopy: { flex: 1, paddingRight: 8 }, zoneName: { color: '#17324D', fontSize: 14, fontWeight: '700' }, coords: { color: '#667887', fontSize: 9, marginTop: 3, fontFamily: 'SpaceMono_400Regular' }, spans: { flexDirection: 'row', gap: 4 }, span: { borderWidth: 1, borderColor: '#C9D3D8', borderRadius: 9, paddingHorizontal: 8, paddingVertical: 7, backgroundColor: '#FFFFFF' }, spanActive: { borderColor: '#2474E5', backgroundColor: '#E6F0FF' }, spanText: { color: '#677681', fontSize: 10, fontWeight: '700' }, spanTextActive: { color: '#1264D3' },
  download: { minHeight: 48, borderRadius: 13, backgroundColor: '#2474E5', flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center' }, downloadText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' }, disabled: { opacity: 0.55 }, offlineBox: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 9, backgroundColor: '#E8F0FE' }, offlineTitle: { color: '#174EA6', fontSize: 13, fontWeight: '800' }, offlineText: { color: '#3C5F8A', fontSize: 11, lineHeight: 16, marginTop: 2 }, errorBox: { borderLeftWidth: 3, borderLeftColor: '#D33C32', borderRadius: 9, padding: 9, marginBottom: 9, backgroundColor: '#FDEAE7' }, errorText: { color: '#9D2720', fontSize: 12 },
});
