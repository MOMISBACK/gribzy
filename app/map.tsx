import { WORLD_LAND_RINGS } from '@/assets/map/world-land';
import { OnlineTileLayer } from '@/components/online-tile-layer';
import { AppTabBar } from '@/components/app-tab-bar';
import {
  GribValidationError,
  bilinearInterpolate,
  gridIndexToLatLon,
  latLonToFractionalGridIndex,
} from '@/lib/gribParser';
import { decodeForecastFrame } from '@/lib/forecastFrame';
import type { ForecastFrame } from '@/lib/forecastFrame';
import type { GribDataset } from '@/lib/gribTypes';
import { getDatasetFile, listGribDatasets } from '@/lib/storage';
import { localizeTechnicalMessage, useI18n } from '@/lib/i18n';
import { SpaceMono_400Regular, SpaceMono_700Bold, useFonts } from '@expo-google-fonts/space-mono';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  GestureResponderEvent,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';

function formatValidTime(validTime: string, language: 'en' | 'fr'): string {
  return new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(new Date(validTime));
}

const LAND_RINGS_WITH_BOUNDS = WORLD_LAND_RINGS.map((ring) => ({
  ring,
  west: Math.min(...ring.map(([longitude]) => longitude)),
  east: Math.max(...ring.map(([longitude]) => longitude)),
  south: Math.min(...ring.map(([, latitude]) => latitude)),
  north: Math.max(...ring.map(([, latitude]) => latitude)),
}));

export default function MapScreen() {
  const { language, t } = useI18n();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const mapWidth = window.width;
  const mapHeight = Math.max(240, window.height);
  const [fontsLoaded] = useFonts({ SpaceMono_400Regular, SpaceMono_700Bold });
  const params = useLocalSearchParams<{ file?: string }>();
  const [dataset, setDataset] = useState<GribDataset | null>(null);
  const [status, setStatus] = useState(t('map.loading'));
  const [fileInfo, setFileInfo] = useState<{
    size: number;
    modified: number;
  } | null>(null);
  const [displayedFrame, setDisplayedFrame] = useState<ForecastFrame | null>(null);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [pendingFrameIndex, setPendingFrameIndex] = useState<number | null>(null);
  const frameCache = useRef(new Map<number, ForecastFrame>());
  const [touched, setTouched] = useState<{
    x: number;
    y: number;
    pressure?: number;
    windSpeed?: number;
    windDir?: string;
  } | null>(null);
  const [onlineMapAvailable, setOnlineMapAvailable] = useState(false);
  const [mapMoving, setMapMoving] = useState(false);
  const [locationPermission, setLocationPermission] = useState(false);
  const [activeParameter, setActiveParameter] = useState<'pressure' | 'wind'>('pressure');
  const [sheet, setSheet] = useState<'parameter' | 'layers' | 'info' | null>(null);
  const [showIsobares, setShowIsobares] = useState(true);
  const [showWind, setShowWind] = useState(true);
  const [viewport, setViewport] = useState<[number, number, number, number] | null>(null);
  const frameRequest = useRef(0);
  const pressureData = displayedFrame?.pressure;
  const windData = displayedFrame?.wind;
  const frameGrid = pressureData?.grid ?? windData?.grid;
  const isobares = pressureData?.isobares;
  const currentDescriptor = dataset?.frames[currentFrameIndex];
  const unavailableLayers = displayedFrame
    ? [
        !displayedFrame.availableLayers.pressure ? t('map.pressureUnavailable') : null,
        !displayedFrame.availableLayers.wind ? t('map.windUnavailable') : null,
      ].filter((value): value is string => value !== null)
    : [];

  useEffect(() => {
    if (dataset) setViewport([dataset.zone.leftlon, dataset.zone.bottomlat, dataset.zone.rightlon, dataset.zone.toplat]);
  }, [dataset]);

  useEffect(() => {
    void Location.requestForegroundPermissionsAsync()
      .then(({ status: permissionStatus }) => setLocationPermission(permissionStatus === 'granted'))
      .catch(() => setLocationPermission(false));
  }, []);

  const projectLatitude = useCallback((latitude: number) => {
    if (!viewport) return 0;
    const clamp = (value: number) => Math.max(-85.05112878, Math.min(85.05112878, value));
    const mercator = (value: number) => {
      const radians = clamp(value) * Math.PI / 180;
      return Math.log(Math.tan(Math.PI / 4 + radians / 2));
    };
    const top = mercator(viewport[3]);
    const bottom = mercator(viewport[1]);
    return ((top - mercator(latitude)) / (top - bottom)) * mapHeight;
  }, [mapHeight, viewport]);

  const projectLongitude = useCallback((longitude: number) => {
    if (!viewport) return 0;
    return ((longitude - viewport[0]) / (viewport[2] - viewport[0])) * mapWidth;
  }, [mapWidth, viewport]);

  const basemapPolygons = useMemo(() => {
    if (!viewport) return [];
    const [leftlon, bottomlat, rightlon, toplat] = viewport;
    const longitudeSpan = rightlon - leftlon;
    const latitudeSpan = toplat - bottomlat;
    if (longitudeSpan <= 0 || latitudeSpan <= 0) return [];

    return LAND_RINGS_WITH_BOUNDS
      .filter(({ west, east, south, north }) => east >= leftlon && west <= rightlon && north >= bottomlat && south <= toplat)
      .map(({ ring }) => ring.map(([longitude, latitude]) => {
        const x = projectLongitude(longitude);
        const y = projectLatitude(latitude);
        return `${x},${y}`;
      }).join(' '));
  }, [projectLatitude, projectLongitude, viewport]);

  const inspectAt = useCallback((longitude: number, latitude: number, x: number, y: number) => {
    if (!displayedFrame) return;
    let pressure: number | undefined;
    let windSpeed: number | undefined;
    let windDir: string | undefined;
    if (displayedFrame.pressure) {
      const { grid, values } = displayedFrame.pressure;
      const index = latLonToFractionalGridIndex(latitude, longitude, grid);
      if (index) pressure = bilinearInterpolate(values, grid.ni, grid.nj, index.i, index.j) ?? undefined;
    }
    if (displayedFrame.wind) {
      const { grid, u, v } = displayedFrame.wind;
      const index = latLonToFractionalGridIndex(latitude, longitude, grid);
      if (index) {
        const interpolatedU = bilinearInterpolate(u, grid.ni, grid.nj, index.i, index.j);
        const interpolatedV = bilinearInterpolate(v, grid.ni, grid.nj, index.i, index.j);
        if (interpolatedU !== null && interpolatedV !== null) {
          windSpeed = Math.sqrt(interpolatedU ** 2 + interpolatedV ** 2) * 1.94384;
          const direction = (Math.atan2(-interpolatedU, -interpolatedV) * 180 / Math.PI + 360) % 360;
          const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
          windDir = directions[Math.round(direction / 45) % 8];
        }
      }
    }
    if (pressure === undefined && windSpeed === undefined) return;
    setTouched({ x, y, pressure, windSpeed, windDir });
  }, [displayedFrame]);

  const readFrame = useCallback(async (metadata: GribDataset, index: number): Promise<ForecastFrame> => {
    const cached = frameCache.current.get(index);
    if (cached) return cached;
    const descriptor = metadata.frames[index];
    if (!descriptor) throw new Error('Forecast frame is unavailable');
    const bytes = await getDatasetFile(descriptor.sourceFileId).bytes();
    const decoded = await decodeForecastFrame(bytes, descriptor);
    frameCache.current.set(index, decoded);
    return decoded;
  }, []);

  const retainNeighborCache = useCallback((index: number) => {
    for (const key of frameCache.current.keys()) {
      if (Math.abs(key - index) > 1) frameCache.current.delete(key);
    }
  }, []);

  const preloadNeighbors = useCallback((metadata: GribDataset, index: number) => {
    for (const neighbor of [index - 1, index + 1]) {
      if (neighbor < 0 || neighbor >= metadata.frames.length || frameCache.current.has(neighbor)) continue;
      void readFrame(metadata, neighbor)
        .then(() => retainNeighborCache(index))
        .catch(error => {
          frameCache.current.delete(neighbor);
          if (__DEV__) console.warn(`Unable to preload forecast frame ${neighbor}`, error);
        });
    }
  }, [readFrame, retainNeighborCache]);

  const displayFrame = useCallback(async (metadata: GribDataset, index: number, resetViewport = false) => {
    if (index < 0 || index >= metadata.frames.length) return;
    const request = ++frameRequest.current;
    setPendingFrameIndex(index);
    setTouched(null);
    try {
      const frame = await readFrame(metadata, index);
      if (request !== frameRequest.current) return;
      setDisplayedFrame(frame);
      setCurrentFrameIndex(index);
      const grid = frame.pressure?.grid ?? frame.wind?.grid;
      if (grid && resetViewport) setViewport([grid.lon1, grid.lat1, grid.lon2, grid.lat2]);
      setStatus(frame.pressure
        ? `${frame.pressure.min.toFixed(0)}–${frame.pressure.max.toFixed(0)} hPa`
        : t('map.pressureUnavailable'));
      retainNeighborCache(index);
      preloadNeighbors(metadata, index);
    } finally {
      if (request === frameRequest.current) setPendingFrameIndex(null);
    }
  }, [preloadNeighbors, readFrame, retainNeighborCache, t]);

  const selectFrame = useCallback(async (index: number) => {
    if (!dataset || pendingFrameIndex !== null || index === currentFrameIndex) return;
    try {
      await displayFrame(dataset, index);
    } catch (error) {
      if (__DEV__) console.error('Forecast frame change failed', error);
      setStatus(t('map.frameUnavailable'));
    }
  }, [currentFrameIndex, dataset, displayFrame, pendingFrameIndex, t]);

  const loadData = useCallback(async () => {
    try {
      setStatus(t('map.reading'));

      if (!params.file) throw new Error(t('map.noFile'));
      const metadata = (await listGribDatasets()).find((item) => item.fileName === params.file);
      if (!metadata) throw new Error(t('map.notFound'));
      setDataset(metadata);
      setFileInfo({ size: metadata.fileSize, modified: metadata.downloadedAt });
      frameCache.current.clear();
      setDisplayedFrame(null);
      setCurrentFrameIndex(0);
      setStatus(t('map.decoding'));
      await displayFrame(metadata, 0, true);
    } catch (error: unknown) {
      if (__DEV__ && error instanceof Error) console.error('GRIB decoding failed', error);
      const message = error instanceof GribValidationError
        ? t('map.unsupportedGrib')
        : error instanceof Error ? localizeTechnicalMessage(error.message, language) : t('map.unreadable');
      setStatus(t('map.error', { message }));
    }
  }, [displayFrame, language, params.file, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleMapPress = (evt: GestureResponderEvent) => {
    const px = evt.nativeEvent.locationX;
    const py = evt.nativeEvent.locationY;
    if (!viewport) return;
    const longitude = viewport[0] + (px / mapWidth) * (viewport[2] - viewport[0]);
    const northMercator = Math.log(Math.tan(Math.PI / 4 + viewport[3] * Math.PI / 360));
    const southMercator = Math.log(Math.tan(Math.PI / 4 + viewport[1] * Math.PI / 360));
    const touchedMercator = northMercator - (py / mapHeight) * (northMercator - southMercator);
    const latitude = (2 * Math.atan(Math.exp(touchedMercator)) - Math.PI / 2) * 180 / Math.PI;
    inspectAt(longitude, latitude, px, py);
  };

  const renderIsobares = () => {
    if (!pressureData || !isobares) return null;
    const elements: ReactElement[] = [];
    const labeledLevels = new Set<number>();

    isobares.forEach((isoLines, level) => {
      const isMain = level % 8 === 0;
      const color = isMain ? '#17324D' : '#9BB0B8';
      const strokeW = isMain ? 1.2 : 0.6;

      isoLines.forEach((l, idx) => {
        const first = gridIndexToLatLon(l.x1, l.y1, pressureData.grid);
        const longitude1 = first.longitude;
        const x1 = projectLongitude(longitude1);
        const latitude1 = first.latitude;
        const y1 = projectLatitude(latitude1);
        const second = gridIndexToLatLon(l.x2, l.y2, pressureData.grid);
        const longitude2 = second.longitude;
        const x2 = projectLongitude(longitude2);
        const latitude2 = second.latitude;
        const y2 = projectLatitude(latitude2);

        elements.push(
          <Line
            key={`${level}-${idx}`}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={color}
            strokeWidth={strokeW}
          />
        );

        if (isMain && !labeledLevels.has(level)) {
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          if (mx > 20 && mx < mapWidth - 20 && my > 10 && my < mapHeight - 10) {
            labeledLevels.add(level);
            elements.push(
              <SvgText
                key={`label-${level}`}
                x={mx} y={my}
                fontSize={8}
                fill="#17324D"
                fillOpacity={0.9}
                textAnchor="middle"
                fontFamily="SpaceMono_400Regular"
              >
                {level}
              </SvgText>
            );
          }
        }
      });
    });

    return elements;
  };

  const renderWind = () => {
    if (!windData) return null;
    const { ni, nj } = windData.grid;
    const step = 2;
    const arrows: ReactElement[] = [];

    for (let j = 0; j < nj; j += step) {
      for (let i = 0; i < ni; i += step) {
        const idx = j * ni + i;
        const u = windData.u[idx];
        const v = windData.v[idx];
        const speed = Math.sqrt(u * u + v * v);
        if (speed < 0.5) continue;

        const point = gridIndexToLatLon(i, j, windData.grid);
        const longitude = point.longitude;
        const cx = projectLongitude(longitude);
        const latitude = point.latitude;
        const cy = projectLatitude(latitude);
        const len = Math.min(speed * 1.5, 18);
        const dx = (u / speed) * len;
        const dy = (-v / speed) * len;
        const x2 = cx + dx;
        const y2 = cy + dy;
        const angle = Math.atan2(dy, dx);
        const headLen = 3;
        const headAngle = 0.4;

        arrows.push(
          <Line
            key={`w-${i}-${j}`}
            x1={cx} y1={cy} x2={x2} y2={y2}
            stroke="#1264D3" strokeWidth={1.3}
          />,
          <Line
            key={`wh1-${i}-${j}`}
            x1={x2} y1={y2}
            x2={x2 - headLen * Math.cos(angle - headAngle)}
            y2={y2 - headLen * Math.sin(angle - headAngle)}
            stroke="#1264D3" strokeWidth={1.3}
          />,
          <Line
            key={`wh2-${i}-${j}`}
            x1={x2} y1={y2}
            x2={x2 - headLen * Math.cos(angle + headAngle)}
            y2={y2 - headLen * Math.sin(angle + headAngle)}
            stroke="#1264D3" strokeWidth={1.3}
          />
        );
      }
    }

    return arrows;
  };

  const isOld = fileInfo
    ? Date.now() - fileInfo.modified > 12 * 60 * 60 * 1000
    : false;

  if (!fontsLoaded) return null;

  return (
    <View style={styles.container}>
      <Pressable style={styles.header} onPress={() => setSheet('parameter')} accessibilityRole="button" accessibilityLabel={t('map.parameterA11y')}>
        <View style={styles.headerTop}><Text style={styles.zoneName}>{activeParameter === 'pressure' ? t('map.pressure') : t('map.wind')}⌄</Text></View>
        <View style={styles.headerBottom}>
          <Text style={[styles.status, isOld && styles.fileDateOld]}>{dataset?.runHour === '--' ? t('map.imported') : `Run ${dataset?.runDate ?? '—'} · ${dataset?.runHour ?? '—'} UTC`}</Text>
          {isOld && (
            <Pressable onPress={() => router.push('/select')}>
              <Text style={styles.refreshHint}>{t('map.refresh')}</Text>
            </Pressable>
          )}
        </View>
      </Pressable>

      <View style={styles.mapContainer}>
        {!displayedFrame && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color="#2474E5" />
            <Text style={styles.loadingText}>{status}</Text>
          </View>
        )}
        {displayedFrame && frameGrid && (
          <View style={{ flex: 1 }}>
            <Svg width={mapWidth} height={mapHeight} style={StyleSheet.absoluteFill}>
              <Rect width={mapWidth} height={mapHeight} fill="#DCECF4" />
              {basemapPolygons.map((points, index) => (
                <Polygon key={`land-${index}`} points={points} fill="#F7F3E8" stroke="#829A91" strokeWidth={0.8} />
              ))}
            </Svg>
            {frameGrid && (
              <OnlineTileLayer
                width={mapWidth}
                height={mapHeight}
                west={frameGrid.lon1}
                east={frameGrid.lon2}
                south={frameGrid.lat1}
                north={frameGrid.lat2}
                onAvailabilityChange={setOnlineMapAvailable}
                onViewportChange={(bounds) => { setViewport(bounds); setTouched(null); }}
                onInteractionChange={setMapMoving}
                onMapPress={(longitude, latitude) => inspectAt(longitude, latitude, projectLongitude(longitude), projectLatitude(latitude))}
                showUserLocation={locationPermission}
              />
            )}
            <Svg
              width={mapWidth}
              height={mapHeight}
              onPress={handleMapPress}
              pointerEvents={onlineMapAvailable ? 'none' : 'auto'}
              style={mapMoving ? styles.weatherOverlayHidden : undefined}
            >
              {showIsobares && renderIsobares()}
              {showWind && renderWind()}
              {touched && (
                <>
                  <Line
                    x1={touched.x - 8} y1={touched.y}
                    x2={touched.x + 8} y2={touched.y}
                    stroke="#E2583E" strokeWidth={2}
                  />
                  <Line
                    x1={touched.x} y1={touched.y - 8}
                    x2={touched.x} y2={touched.y + 8}
                    stroke="#E2583E" strokeWidth={2}
                  />
                </>
              )}
            </Svg>

            {onlineMapAvailable && (
              <Pressable
                accessibilityRole="link"
                onPress={() => void Linking.openURL('https://openfreemap.org/')}
                style={styles.mapAttribution}
              >
                <Text style={styles.mapAttributionText}>OpenFreeMap © OpenMapTiles · OpenStreetMap</Text>
              </Pressable>
            )}

            <Pressable style={styles.layersButton} onPress={() => setSheet('layers')} accessibilityRole="button" accessibilityLabel={t('map.layersA11y')}>
              <MaterialIcons name="layers" size={24} color="#1967D2" />
            </Pressable>
            <Pressable style={styles.infoButton} onPress={() => setSheet('info')} accessibilityRole="button" accessibilityLabel={t('map.infoA11y')}>
              <MaterialIcons name="info-outline" size={24} color="#1967D2" />
            </Pressable>

            <View style={[styles.timeline, { bottom: 88 + insets.bottom }]} accessibilityLabel={t('map.timelineA11y')}>
              <Pressable
                style={[styles.timelineStep, currentFrameIndex === 0 && styles.timelineStepDisabled]}
                disabled={currentFrameIndex === 0 || pendingFrameIndex !== null}
                onPress={() => void selectFrame(currentFrameIndex - 1)}
                accessibilityRole="button"
                accessibilityLabel={t('map.previousForecast')}
              >
                <MaterialIcons name="chevron-left" size={25} color="#1967D2" />
              </Pressable>
              <View style={styles.timelineCopy}>
                <View style={styles.timelineLabels}>
                  <Text style={styles.timelineHour}>H+{currentDescriptor?.forecastHour ?? 0}</Text>
                  <Text style={styles.timelineDate}>
                    {pendingFrameIndex !== null
                      ? t('map.loadingForecast')
                      : currentDescriptor ? formatValidTime(currentDescriptor.validTime, language) : '—'}
                  </Text>
                </View>
                {unavailableLayers.length > 0 && (
                  <Text style={styles.timelineWarning}>{unavailableLayers.join(' · ')}</Text>
                )}
                <View
                  style={styles.timelineTrack}
                  accessibilityRole="adjustable"
                  accessibilityValue={{
                    min: 0,
                    max: Math.max(0, (dataset?.frames.length ?? 1) - 1),
                    now: currentFrameIndex,
                    text: `H+${currentDescriptor?.forecastHour ?? 0}`,
                  }}
                  accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
                  onAccessibilityAction={({ nativeEvent }) => {
                    const delta = nativeEvent.actionName === 'increment' ? 1 : -1;
                    void selectFrame(currentFrameIndex + delta);
                  }}
                >
                  {dataset?.frames.map((descriptor, index) => (
                    <Pressable
                      key={`${descriptor.sourceFileId}-${descriptor.forecastHour}`}
                      style={[
                        styles.timelineDotTarget,
                        { left: `${dataset.frames.length === 1 ? 0 : index / (dataset.frames.length - 1) * 100}%` },
                      ]}
                      onPress={() => void selectFrame(index)}
                      disabled={pendingFrameIndex !== null}
                      accessibilityRole="button"
                      accessibilityLabel={`H+${descriptor.forecastHour}`}
                    >
                      <View style={[
                        styles.timelineDot,
                        index === currentFrameIndex && styles.timelineDotActive,
                        index === pendingFrameIndex && styles.timelineDotPending,
                      ]} />
                    </Pressable>
                  ))}
                </View>
              </View>
              <Pressable
                style={[styles.timelineStep, currentFrameIndex >= (dataset?.frames.length ?? 1) - 1 && styles.timelineStepDisabled]}
                disabled={currentFrameIndex >= (dataset?.frames.length ?? 1) - 1 || pendingFrameIndex !== null}
                onPress={() => void selectFrame(currentFrameIndex + 1)}
                accessibilityRole="button"
                accessibilityLabel={t('map.nextForecast')}
              >
                <MaterialIcons name="chevron-right" size={25} color="#1967D2" />
              </Pressable>
            </View>

            {touched && (
              <View style={[styles.infoPanel, { bottom: 166 + insets.bottom }]}>
                <View style={styles.infoHeader}><Text style={styles.infoPlace} numberOfLines={1}>{dataset?.zone.label ?? t('map.weatherPoint')}</Text><Pressable accessibilityLabel={t('map.close')} hitSlop={10} onPress={() => setTouched(null)}><MaterialIcons name="close" size={22} color="#5F6368" /></Pressable></View>
                <View style={styles.infoMetrics}><View style={styles.infoMetric}><Text style={styles.infoLabel}>{t('map.wind')}</Text><Text style={styles.infoWind}>{touched.windSpeed === undefined ? t('map.layerUnavailable') : `${touched.windSpeed.toFixed(0)} kt ${touched.windDir}`}</Text></View><View style={styles.infoMetric}><Text style={styles.infoLabel}>{t('map.pressure')}</Text><Text style={styles.infoPressure}>{touched.pressure === undefined ? t('map.layerUnavailable') : `${touched.pressure.toFixed(1)} hPa`}</Text></View></View>
              </View>
            )}
          </View>
        )}
      </View>

      <AppTabBar active="map" mapFile={dataset?.fileName} />
      <Modal visible={sheet !== null} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSheet(null)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{sheet === 'parameter' ? t('map.parameter') : sheet === 'layers' ? t('map.display') : t('map.file')}</Text>
          {sheet === 'parameter' ? <>
            <SheetChoice icon="compress" title={t('map.pressure')} detail="hPa" selected={activeParameter === 'pressure'} onPress={() => { setActiveParameter('pressure'); setShowIsobares(true); setSheet(null); }} />
            <SheetChoice icon="air" title={t('map.wind')} detail={t('map.knots')} selected={activeParameter === 'wind'} onPress={() => { setActiveParameter('wind'); setShowWind(true); setSheet(null); }} />
          </> : sheet === 'layers' ? <>
            <SheetToggle icon="waves" title={t('map.showIsobars')} value={showIsobares && !!pressureData} disabled={!pressureData} onValueChange={setShowIsobares} />
            <SheetToggle icon="air" title={t('map.showWind')} value={showWind && !!windData} disabled={!windData} onValueChange={setShowWind} />
            <SheetToggle icon="public" title={t('map.detailedMap')} value={onlineMapAvailable} disabled onValueChange={() => undefined} />
          </> : <>
            <InfoRow label={t('map.name')} value={dataset?.zone.label ?? '—'} />
            <InfoRow label={t('map.model')} value={dataset?.model ?? '—'} />
            <InfoRow label={t('map.resolution')} value={dataset?.resolution ?? '—'} />
            <InfoRow label={t('map.run')} value={dataset?.runHour === '--' ? t('map.unknownOrigin') : `${dataset?.runDate ?? '—'} · ${dataset?.runHour ?? '—'} UTC`} />
            <InfoRow label={t('map.size')} value={fileInfo ? `${(fileInfo.size / 1024).toFixed(0)} KB` : '—'} />
            <InfoRow label={t('map.area')} value={dataset ? `${dataset.zone.bottomlat}° / ${dataset.zone.toplat}° · ${dataset.zone.leftlon}° / ${dataset.zone.rightlon}°` : '—'} />
          </>}
        </View>
      </Modal>
    </View>
  );
}

function SheetChoice({ icon, title, detail, selected, onPress }: { icon: keyof typeof MaterialIcons.glyphMap; title: string; detail: string; selected: boolean; onPress: () => void }) {
  return <Pressable style={styles.sheetRow} onPress={onPress}><MaterialIcons name={icon} size={24} color="#1967D2" /><Text style={styles.sheetRowTitle}>{title}</Text><Text style={styles.sheetDetail}>{detail}</Text>{selected && <MaterialIcons name="check" size={24} color="#1967D2" />}</Pressable>;
}

function SheetToggle({ icon, title, value, disabled, onValueChange }: { icon: keyof typeof MaterialIcons.glyphMap; title: string; value: boolean; disabled?: boolean; onValueChange: (value: boolean) => void }) {
  return <View style={[styles.sheetRow, disabled && styles.sheetRowDisabled]}><MaterialIcons name={icon} size={24} color="#5F6368" /><Text style={styles.sheetRowTitle}>{title}</Text><Switch value={value} disabled={disabled} onValueChange={onValueChange} trackColor={{ true: '#AECBFA' }} thumbColor={value ? '#1967D2' : '#F1F3F4'} /></View>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.infoRow}><Text style={styles.infoRowLabel}>{label}</Text><Text style={styles.infoRowValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F2EA',
  },
  header: {
    position: 'absolute',
    zIndex: 10,
    top: 48,
    left: 16,
    right: 76,
    maxHeight: 68,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.94)',
    shadowColor: '#202124',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 4,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  headerBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  zoneName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#202124',
  },
  fileDateOld: {
    color: '#D06A2D',
  },
  status: {
    fontFamily: 'SpaceMono_400Regular',
    fontSize: 12,
    color: '#5F6368',
  },
  refreshHint: {
    fontFamily: 'SpaceMono_400Regular',
    fontSize: 10,
    color: '#D06A2D',
  },
  mapContainer: {
    flex: 1,
    backgroundColor: '#DCECF4',
    justifyContent: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontFamily: 'SpaceMono_400Regular',
    fontSize: 11,
    color: '#607080',
  },
  infoPanel: {
    position: 'absolute',
    zIndex: 14,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 20,
    padding: 14,
    elevation: 6,
    shadowColor: '#202124',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  mapAttribution: {
    position: 'absolute',
    right: 5,
    top: 5,
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  mapAttributionText: {
    color: '#334B5E',
    fontSize: 9,
    fontWeight: '600',
  },
  layersButton: { position: 'absolute', top: 50, right: 16, width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.96)', alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#202124', shadowOpacity: 0.14, shadowRadius: 8 },
  infoButton: { position: 'absolute', top: 110, right: 16, width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.96)', alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#202124', shadowOpacity: 0.14, shadowRadius: 8 },
  weatherOverlayHidden: { opacity: 0 },
  timeline: { position: 'absolute', zIndex: 12, left: 16, right: 16, minHeight: 66, borderRadius: 20, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.95)', elevation: 5, shadowColor: '#202124', shadowOpacity: 0.14, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  timelineStep: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E8F0FE', alignItems: 'center', justifyContent: 'center' },
  timelineStepDisabled: { opacity: 0.35 },
  timelineCopy: { flex: 1, gap: 7 },
  timelineLabels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timelineHour: { color: '#202124', fontSize: 14, fontWeight: '700' },
  timelineDate: { color: '#5F6368', fontSize: 10 },
  timelineWarning: { color: '#B06000', fontSize: 10, fontWeight: '700' },
  timelineTrack: { height: 24, borderRadius: 12, backgroundColor: '#DADCE0', justifyContent: 'center', position: 'relative' },
  timelineDotTarget: { position: 'absolute', marginLeft: -12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  timelineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#9AA0A6' },
  timelineDotActive: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#1967D2' },
  timelineDotPending: { backgroundColor: '#F9AB00' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(32,33,36,0.28)' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 34 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#C4C7C5', alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { color: '#202124', fontSize: 24, fontWeight: '700', marginBottom: 12 },
  sheetRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 8, borderRadius: 16 },
  sheetRowDisabled: { opacity: 0.52 },
  sheetRowTitle: { flex: 1, color: '#202124', fontSize: 16, fontWeight: '600' },
  sheetDetail: { color: '#5F6368', fontSize: 14 },
  infoHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  infoPlace: { flex: 1, color: '#202124', fontSize: 16, fontWeight: '700', paddingRight: 12 },
  infoMetrics: { flexDirection: 'row', gap: 12, marginTop: 12 },
  infoMetric: { flex: 1, backgroundColor: '#F8F9FA', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10 },
  infoLabel: { color: '#80868B', fontSize: 11, fontWeight: '600', marginBottom: 3 },
  infoPressure: { fontFamily: 'SpaceMono_700Bold', fontSize: 14, color: '#17324D' },
  infoWind: { fontFamily: 'SpaceMono_700Bold', fontSize: 14, color: '#1264D3' },
  infoRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 8 },
  infoRowLabel: { width: 72, color: '#80868B', fontSize: 13 },
  infoRowValue: { flex: 1, color: '#202124', fontSize: 14, fontWeight: '600', textAlign: 'right' },
});
