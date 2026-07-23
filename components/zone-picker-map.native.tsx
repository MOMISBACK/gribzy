import { Camera, Map, type ViewStateChangeEvent } from '@maplibre/maplibre-react-native';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { zoneFromVisibleBounds } from '@/lib/downloadZone';
import type { GribZone } from '@/lib/gribTypes';
import { useI18n } from '@/lib/i18n';
import { EmbeddedZonePickerMap } from './embedded-zone-picker-map';

const OPEN_FREE_MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';

interface ZonePickerMapProps {
  zone: GribZone;
  focusRequest?: number;
  onChange: (zone: GribZone) => void;
}

export function ZonePickerMap({ zone, focusRequest = 0, onChange }: ZonePickerMapProps) {
  const { language } = useI18n();
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);

  const handleRegionChange = (event: { nativeEvent: ViewStateChangeEvent }) => {
    onChange(zoneFromVisibleBounds(event.nativeEvent.bounds, language));
  };

  return <View style={styles.frame}>
    {mapFailed
      ? <EmbeddedZonePickerMap zone={zone} focusRequest={focusRequest} onChange={onChange} />
      : <View style={styles.loadingMap}><ActivityIndicator color="#1967D2" /></View>}
    <View pointerEvents={mapReady ? 'auto' : 'none'} style={[styles.onlineMap, !mapReady && styles.onlineMapLoading]}>
      <Map
        mapStyle={OPEN_FREE_MAP_STYLE}
        attribution
        attributionPosition={{ top: 118, right: 8 }}
        logo={false}
        compass
        compassPosition={{ top: 118, left: 8 }}
        touchRotate={false}
        touchPitch={false}
        onRegionDidChange={handleRegionChange}
        onDidFinishLoadingMap={() => { setMapReady(true); setMapFailed(false); }}
        onDidFailLoadingMap={() => { setMapReady(false); setMapFailed(true); }}
        style={styles.map}
      >
        <Camera
          key={`focus-${focusRequest}`}
          initialViewState={{
            bounds: [zone.leftlon, zone.bottomlat, zone.rightlon, zone.toplat],
            padding: { top: 0, right: 0, bottom: 0, left: 0 },
            bearing: 0,
            pitch: 0,
          }}
        />
      </Map>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  frame: { flex: 1, overflow: 'hidden', backgroundColor: '#DCECF4' },
  loadingMap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EDF3F8' },
  onlineMap: { ...StyleSheet.absoluteFillObject },
  onlineMapLoading: { opacity: 0 },
  map: { flex: 1 },
});
