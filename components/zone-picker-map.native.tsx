import { Camera, GeoJSONSource, Layer, Map, type ViewStateChangeEvent } from '@maplibre/maplibre-react-native';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { FeatureCollection, Polygon } from 'geojson';

import { describeLocation } from '@/lib/geoNames';
import type { GribZone } from '@/lib/gribTypes';
import { EmbeddedZonePickerMap } from './embedded-zone-picker-map';

const OPEN_FREE_MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';
const DOMAIN = { west: -180, east: 180, south: -85, north: 85 };

interface ZonePickerMapProps {
  zone: GribZone;
  span: number;
  focusRequest?: number;
  onChange: (zone: GribZone) => void;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function zoneAt(latitude: number, longitude: number, span: number): GribZone {
  const halfWidth = span / 2;
  const halfHeight = span / 4;
  const centerLon = clamp(longitude, DOMAIN.west + halfWidth, DOMAIN.east - halfWidth);
  const centerLat = clamp(latitude, DOMAIN.south + halfHeight, DOMAIN.north - halfHeight);
  return {
    label: describeLocation(centerLat, centerLon),
    leftlon: Number((centerLon - halfWidth).toFixed(1)),
    rightlon: Number((centerLon + halfWidth).toFixed(1)),
    bottomlat: Number((centerLat - halfHeight).toFixed(1)),
    toplat: Number((centerLat + halfHeight).toFixed(1)),
  };
}

export function ZonePickerMap({ zone, span, focusRequest = 0, onChange }: ZonePickerMapProps) {
  const [mapReady, setMapReady] = useState(false);
  const center: [number, number] = [(zone.leftlon + zone.rightlon) / 2, (zone.bottomlat + zone.toplat) / 2];
  const zoneShape = useMemo<FeatureCollection<Polygon>>(() => ({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [zone.leftlon, zone.bottomlat], [zone.rightlon, zone.bottomlat],
          [zone.rightlon, zone.toplat], [zone.leftlon, zone.toplat],
          [zone.leftlon, zone.bottomlat],
        ]],
      },
    }],
  }), [zone.bottomlat, zone.leftlon, zone.rightlon, zone.toplat]);

  const handleRegionChange = (event: { nativeEvent: ViewStateChangeEvent }) => {
    if (!event.nativeEvent.userInteraction) return;
    const [longitude, latitude] = event.nativeEvent.center;
    onChange(zoneAt(latitude, longitude, span));
  };

  return <View style={styles.frame}>
    <EmbeddedZonePickerMap zone={zone} span={span} focusRequest={focusRequest} onChange={onChange} />
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
        onDidFinishLoadingMap={() => setMapReady(true)}
        onDidFailLoadingMap={() => setMapReady(false)}
        style={styles.map}
      >
        <Camera
          key={`focus-${focusRequest}`}
          initialViewState={{ center, zoom: Math.max(2, Math.min(10, Math.log2(360 / span) + 0.6)), bearing: 0, pitch: 0 }}
        />
        <GeoJSONSource id="selected-grib-zone" data={zoneShape}>
          <Layer id="selected-grib-zone-fill" type="fill" paint={{ 'fill-color': '#1967D2', 'fill-opacity': 0.16 }} />
          <Layer id="selected-grib-zone-line" type="line" paint={{ 'line-color': '#1967D2', 'line-width': 3 }} />
        </GeoJSONSource>
      </Map>
    </View>
    {mapReady && <View pointerEvents="none" style={styles.help}><Text style={styles.helpText}>Déplace la carte pour placer le cadre · pince pour zoomer</Text></View>}
  </View>;
}

const styles = StyleSheet.create({
  frame: { flex: 1, overflow: 'hidden', backgroundColor: '#DCECF4' },
  onlineMap: { ...StyleSheet.absoluteFillObject },
  onlineMapLoading: { opacity: 0 },
  map: { flex: 1 },
  help: { position: 'absolute', left: 16, right: 16, top: 118, alignItems: 'center' },
  helpText: { color: '#3C4043', backgroundColor: 'rgba(255,255,255,0.94)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, fontSize: 12, fontWeight: '600' },
});
