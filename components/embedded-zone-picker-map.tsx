import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';

import { WORLD_LAND_RINGS } from '@/assets/map/world-land';
import { describeLocation } from '@/lib/geoNames';
import type { GribZone } from '@/lib/gribTypes';
import { useI18n } from '@/lib/i18n';

const DOMAIN = { west: -180, east: 180, south: -85, north: 85 };
const MIN_ZOOM = 1;
const MAX_ZOOM = 12;

interface Viewport { centerLon: number; centerLat: number; zoom: number }
interface Size { width: number; height: number }
interface GestureStart extends Viewport { x: number; y: number; distance: number; touchCount: number; moved: boolean }

interface ZonePickerMapProps {
  zone: GribZone;
  span: number;
  focusRequest?: number;
  onChange: (zone: GribZone) => void;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function touchCenter(touches: readonly { pageX: number; pageY: number }[]) {
  if (touches.length < 2) return { x: touches[0]?.pageX ?? 0, y: touches[0]?.pageY ?? 0, distance: 0 };
  const [a, b] = touches;
  return { x: (a.pageX + b.pageX) / 2, y: (a.pageY + b.pageY) / 2, distance: Math.hypot(b.pageX - a.pageX, b.pageY - a.pageY) };
}

function constrainViewport(viewport: Viewport): Viewport {
  const zoom = clamp(viewport.zoom, MIN_ZOOM, MAX_ZOOM);
  const maxLon = 180 - 180 / zoom;
  const maxLat = 85 - 85 / zoom;
  return { zoom, centerLon: clamp(viewport.centerLon, -maxLon, maxLon), centerLat: clamp(viewport.centerLat, -maxLat, maxLat) };
}

function scaleFor(size: Size, zoom: number) {
  return Math.min(size.width / 360, size.height / 170) * zoom;
}

function geoToScreen(longitude: number, latitude: number, size: Size, viewport: Viewport) {
  const scale = scaleFor(size, viewport.zoom);
  return { x: size.width / 2 + (longitude - viewport.centerLon) * scale, y: size.height / 2 - (latitude - viewport.centerLat) * scale };
}

function screenToGeo(x: number, y: number, size: Size, viewport: Viewport) {
  const scale = scaleFor(size, viewport.zoom);
  return { longitude: viewport.centerLon + (x - size.width / 2) / scale, latitude: viewport.centerLat - (y - size.height / 2) / scale };
}

export function EmbeddedZonePickerMap({ zone, span, focusRequest = 0, onChange }: ZonePickerMapProps) {
  const { language, t } = useI18n();
  const [size, setSize] = useState<Size>({ width: 1, height: 1 });
  const [viewport, setViewport] = useState<Viewport>({ centerLon: 0, centerLat: 0, zoom: 1 });
  const viewportRef = useRef(viewport);
  const start = useRef<GestureStart>({ ...viewport, x: 0, y: 0, distance: 0, touchCount: 0, moved: false });

  const updateViewport = useCallback((next: Viewport) => {
    const constrained = constrainViewport(next);
    viewportRef.current = constrained;
    setViewport(constrained);
  }, []);

  const selectAt = useCallback((x: number, y: number) => {
    const point = screenToGeo(x, y, size, viewportRef.current);
    const halfWidth = span / 2;
    const halfHeight = span / 4;
    const longitude = clamp(point.longitude, DOMAIN.west + halfWidth, DOMAIN.east - halfWidth);
    const latitude = clamp(point.latitude, DOMAIN.south + halfHeight, DOMAIN.north - halfHeight);
    onChange({
      label: describeLocation(latitude, longitude, language),
      leftlon: Number((longitude - halfWidth).toFixed(1)), rightlon: Number((longitude + halfWidth).toFixed(1)),
      bottomlat: Number((latitude - halfHeight).toFixed(1)), toplat: Number((latitude + halfHeight).toFixed(1)),
    });
  }, [language, onChange, size, span]);

  useEffect(() => {
    if (focusRequest === 0 || size.width <= 1) return;
    updateViewport({
      centerLon: (zone.leftlon + zone.rightlon) / 2,
      centerLat: (zone.bottomlat + zone.toplat) / 2,
      zoom: clamp(360 / (span * 4), 3, MAX_ZOOM),
    });
  }, [focusRequest, size.width, span, updateViewport, zone.bottomlat, zone.leftlon, zone.rightlon, zone.toplat]);

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => {
      const point = touchCenter(event.nativeEvent.touches);
      start.current = { ...viewportRef.current, ...point, touchCount: event.nativeEvent.touches.length, moved: false };
    },
    onPanResponderMove: (event) => {
      const point = touchCenter(event.nativeEvent.touches);
      if (event.nativeEvent.touches.length !== start.current.touchCount) {
        start.current = { ...viewportRef.current, ...point, touchCount: event.nativeEvent.touches.length, moved: true };
        return;
      }
      const initial = start.current;
      const zoom = initial.distance > 0 && point.distance > 0
        ? clamp(initial.zoom * point.distance / initial.distance, MIN_ZOOM, MAX_ZOOM)
        : initial.zoom;
      const scale = scaleFor(size, initial.zoom);
      if (Math.abs(point.x - initial.x) + Math.abs(point.y - initial.y) > 5 || Math.abs(zoom - initial.zoom) > 0.02) initial.moved = true;
      updateViewport({ centerLon: initial.centerLon - (point.x - initial.x) / scale, centerLat: initial.centerLat + (point.y - initial.y) / scale, zoom });
    },
    onPanResponderRelease: (event) => {
      if (!start.current.moved) {
        const touch = event.nativeEvent.changedTouches[0];
        if (touch) selectAt(touch.locationX, touch.locationY);
      }
    },
    onPanResponderTerminationRequest: () => false,
  }), [selectAt, size, updateViewport]);

  const polygons = useMemo(() => WORLD_LAND_RINGS.map((ring) => ring.map(([lon, lat]) => {
    const point = geoToScreen(lon, lat, size, viewport);
    return `${point.x},${point.y}`;
  }).join(' ')), [size, viewport]);

  const topLeft = geoToScreen(zone.leftlon, zone.toplat, size, viewport);
  const bottomRight = geoToScreen(zone.rightlon, zone.bottomlat, size, viewport);
  const gridStep = viewport.zoom < 2 ? 60 : viewport.zoom < 5 ? 20 : 10;

  return (
    <View style={styles.frame} onLayout={(event) => setSize(event.nativeEvent.layout)} {...responder.panHandlers}>
      <Svg width="100%" height="100%">
        <Rect width={size.width} height={size.height} fill="#DCECF4" />
        {Array.from({ length: 360 / gridStep + 1 }, (_, i) => -180 + i * gridStep).map((lon) => {
          const x = geoToScreen(lon, 0, size, viewport).x;
          return <Line key={`lon-${lon}`} x1={x} x2={x} y1={0} y2={size.height} stroke="#BBD3DF" strokeWidth={1} />;
        })}
        {Array.from({ length: 170 / gridStep + 1 }, (_, i) => -80 + i * gridStep).map((lat) => {
          const y = geoToScreen(0, lat, size, viewport).y;
          return <Line key={`lat-${lat}`} x1={0} x2={size.width} y1={y} y2={y} stroke="#BBD3DF" strokeWidth={1} />;
        })}
        {polygons.map((points, index) => <Polygon key={index} points={points} fill="#F7F3E8" stroke="#829A91" strokeWidth={0.7} />)}
        <Rect x={topLeft.x} y={topLeft.y} width={bottomRight.x - topLeft.x} height={bottomRight.y - topLeft.y} fill="#2474E5" fillOpacity={0.2} stroke="#1264D3" strokeWidth={3} />
        <SvgText x={14} y={22} fill="#31576B" fontSize={11} fontFamily="SpaceMono_700Bold">{viewport.zoom.toFixed(1)}×</SvgText>
      </Svg>
      <View pointerEvents="none" style={styles.help}><Text style={styles.helpText}>{t('gesture.embedded')}</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, overflow: 'hidden', backgroundColor: '#DCECF4' },
  help: { position: 'absolute', left: 10, right: 10, top: 128, alignItems: 'center' },
  helpText: { color: '#24495C', backgroundColor: 'rgba(255,255,255,0.9)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, fontSize: 9, fontFamily: 'SpaceMono_700Bold' },
});
