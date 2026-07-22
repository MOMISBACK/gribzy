import { WORLD_LAND_RINGS } from '@/assets/map/world-land';
import { OnlineTileLayer } from '@/components/online-tile-layer';
import { AppTabBar } from '@/components/app-tab-bar';
import {
  IsobareLine,
  computeIsobares,
  decodeValues,
  findGribMessages,
  readDataRepresentation,
  readGridDefinition,
  readMessageParameter,
} from '@/lib/gribParser';
import type { GribDataset } from '@/lib/gribTypes';
import { getDatasetFile, listGribDatasets } from '@/lib/storage';
import { localizeTechnicalMessage, useI18n } from '@/lib/i18n';
import { SpaceMono_400Regular, SpaceMono_700Bold, useFonts } from '@expo-google-fonts/space-mono';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { type ReactElement, useCallback, useEffect, useMemo, useState } from 'react';
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
import Svg, { Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';

const LAND_RINGS_WITH_BOUNDS = WORLD_LAND_RINGS.map((ring) => ({
  ring,
  west: Math.min(...ring.map(([longitude]) => longitude)),
  east: Math.max(...ring.map(([longitude]) => longitude)),
  south: Math.min(...ring.map(([, latitude]) => latitude)),
  north: Math.max(...ring.map(([, latitude]) => latitude)),
}));

export default function MapScreen() {
  const { language, t } = useI18n();
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
  const [gridData, setGridData] = useState<{
    values: Float32Array;
    ni: number;
    nj: number;
    min: number;
    max: number;
  } | null>(null);
  const [isobares, setIsobares] = useState<Map<number, IsobareLine[]> | null>(null);
  const [windData, setWindData] = useState<{
    u: Float32Array;
    v: Float32Array;
  } | null>(null);
  const [touched, setTouched] = useState<{
    x: number;
    y: number;
    pressure: number;
    windSpeed: number;
    windDir: string;
  } | null>(null);
  const [onlineMapAvailable, setOnlineMapAvailable] = useState(false);
  const [activeParameter, setActiveParameter] = useState<'pressure' | 'wind'>('pressure');
  const [sheet, setSheet] = useState<'parameter' | 'layers' | 'info' | null>(null);
  const [showIsobares, setShowIsobares] = useState(true);
  const [showWind, setShowWind] = useState(true);
  const [viewport, setViewport] = useState<[number, number, number, number] | null>(null);

  useEffect(() => {
    if (dataset) setViewport([dataset.zone.leftlon, dataset.zone.bottomlat, dataset.zone.rightlon, dataset.zone.toplat]);
  }, [dataset]);

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
    if (!gridData || !windData || !dataset) return;
    const { ni, nj } = gridData;
    const i = Math.floor(((longitude - dataset.zone.leftlon) / (dataset.zone.rightlon - dataset.zone.leftlon)) * ni);
    const j = Math.floor(((dataset.zone.toplat - latitude) / (dataset.zone.toplat - dataset.zone.bottomlat)) * nj);
    if (i < 0 || i >= ni || j < 0 || j >= nj) return;
    const idx = (nj - 1 - j) * ni + i;
    const pressure = gridData.values[idx];
    const u = windData.u[idx];
    const v = windData.v[idx];
    const speedKt = Math.sqrt(u * u + v * v) * 1.94384;
    const dirDeg = (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    setTouched({ x, y, pressure, windSpeed: speedKt, windDir: dirs[Math.round(dirDeg / 45) % 8] });
  }, [dataset, gridData, windData]);

  const loadData = useCallback(async () => {
    try {
      setStatus(t('map.reading'));

      if (!params.file) throw new Error(t('map.noFile'));
      const metadata = (await listGribDatasets()).find((item) => item.fileName === params.file);
      if (!metadata) throw new Error(t('map.notFound'));
      setDataset(metadata);
      setFileInfo({ size: metadata.fileSize, modified: metadata.downloadedAt });

      const file = getDatasetFile(params.file);
      const bytes = await file.bytes();

      const messages = findGribMessages(bytes);

      const pressureMsg = messages.find(msg =>
        readMessageParameter(bytes, msg.offset).name.includes('pressure')
      );
      if (!pressureMsg) throw new Error(t('map.pressureMissing'));

      const grid = readGridDefinition(bytes, pressureMsg.offset);
      const repr = readDataRepresentation(bytes, pressureMsg.offset);

      setStatus(t('map.decoding'));
      const raw = await decodeValues(bytes, pressureMsg.offset, repr);

      const values = new Float32Array(raw.length);
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < raw.length; i++) {
        values[i] = raw[i] / 100;
        if (values[i] < min) min = values[i];
        if (values[i] > max) max = values[i];
      }

      const levels: number[] = [];
      const startLevel = Math.ceil(min / 4) * 4;
      for (let l = startLevel; l <= max; l += 4) {
        levels.push(l);
      }
      const iso = computeIsobares(values, grid.ni, grid.nj, levels);

      setGridData({ values, ni: grid.ni, nj: grid.nj, min, max });
      setIsobares(iso);

      const uMsg = messages.find(msg =>
        readMessageParameter(bytes, msg.offset).name.includes('U wind')
      );
      const vMsg = messages.find(msg =>
        readMessageParameter(bytes, msg.offset).name.includes('V wind')
      );

      if (uMsg && vMsg) {
        const reprU = readDataRepresentation(bytes, uMsg.offset);
        const reprV = readDataRepresentation(bytes, vMsg.offset);
        const rawU = await decodeValues(bytes, uMsg.offset, reprU);
        const rawV = await decodeValues(bytes, vMsg.offset, reprV);
        setWindData({ u: rawU, v: rawV });
      }

      setStatus(`${min.toFixed(0)}–${max.toFixed(0)} hPa`);
    } catch (error: unknown) {
      const message = error instanceof Error ? localizeTechnicalMessage(error.message, language) : t('map.unreadable');
      setStatus(t('map.error', { message }));
    }
  }, [language, params.file, t]);

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
    if (!gridData || !isobares) return null;
    const { ni, nj } = gridData;
    const elements: ReactElement[] = [];
    const labeledLevels = new Set<number>();

    isobares.forEach((isoLines, level) => {
      const isMain = level % 8 === 0;
      const color = isMain ? '#17324D' : '#9BB0B8';
      const strokeW = isMain ? 1.2 : 0.6;

      isoLines.forEach((l, idx) => {
        const longitude1 = dataset!.zone.leftlon + (l.x1 / (ni - 1)) * (dataset!.zone.rightlon - dataset!.zone.leftlon);
        const x1 = projectLongitude(longitude1);
        const latitude1 = dataset!.zone.bottomlat + (l.y1 / (nj - 1)) * (dataset!.zone.toplat - dataset!.zone.bottomlat);
        const y1 = projectLatitude(latitude1);
        const longitude2 = dataset!.zone.leftlon + (l.x2 / (ni - 1)) * (dataset!.zone.rightlon - dataset!.zone.leftlon);
        const x2 = projectLongitude(longitude2);
        const latitude2 = dataset!.zone.bottomlat + (l.y2 / (nj - 1)) * (dataset!.zone.toplat - dataset!.zone.bottomlat);
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
    if (!gridData || !windData) return null;
    const { ni, nj } = gridData;
    const step = 2;
    const arrows: ReactElement[] = [];

    for (let j = 0; j < nj; j += step) {
      for (let i = 0; i < ni; i += step) {
        const idx = (nj - 1 - j) * ni + i;
        const u = windData.u[idx];
        const v = windData.v[idx];
        const speed = Math.sqrt(u * u + v * v);
        if (speed < 0.5) continue;

        const longitude = dataset!.zone.leftlon + ((i + 0.5) / ni) * (dataset!.zone.rightlon - dataset!.zone.leftlon);
        const cx = projectLongitude(longitude);
        const latitude = dataset!.zone.toplat - ((j + 0.5) / nj) * (dataset!.zone.toplat - dataset!.zone.bottomlat);
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
        {!gridData && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color="#2474E5" />
            <Text style={styles.loadingText}>{status}</Text>
          </View>
        )}
        {gridData && (
          <View style={{ flex: 1 }}>
            <Svg width={mapWidth} height={mapHeight} style={StyleSheet.absoluteFill}>
              <Rect width={mapWidth} height={mapHeight} fill="#DCECF4" />
              {basemapPolygons.map((points, index) => (
                <Polygon key={`land-${index}`} points={points} fill="#F7F3E8" stroke="#829A91" strokeWidth={0.8} />
              ))}
            </Svg>
            {dataset && (
              <OnlineTileLayer
                width={mapWidth}
                height={mapHeight}
                west={dataset.zone.leftlon}
                east={dataset.zone.rightlon}
                south={dataset.zone.bottomlat}
                north={dataset.zone.toplat}
                onAvailabilityChange={setOnlineMapAvailable}
                onViewportChange={(bounds) => { setViewport(bounds); setTouched(null); }}
                onMapPress={(longitude, latitude) => inspectAt(longitude, latitude, projectLongitude(longitude), projectLatitude(latitude))}
              />
            )}
            <Svg
              width={mapWidth}
              height={mapHeight}
              onPress={handleMapPress}
              pointerEvents={onlineMapAvailable ? 'none' : 'auto'}
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

            <View style={styles.timeline} accessibilityLabel={t('map.timelineA11y')}>
              <View style={styles.timelinePlay}><MaterialIcons name="play-arrow" size={22} color="#9AA0A6" /></View>
              <View style={styles.timelineCopy}><View style={styles.timelineLabels}><Text style={styles.timelineHour}>H+0</Text><Text style={styles.timelineOnly}>{t('map.oneForecast')}</Text></View><View style={styles.timelineTrack}><View style={styles.timelineDot} /></View></View>
              <MaterialIcons name="expand-less" size={22} color="#9AA0A6" />
            </View>

            {touched && (
              <View style={styles.infoPanel}>
                <View style={styles.infoHeader}><Text style={styles.infoPlace} numberOfLines={1}>{dataset?.zone.label ?? t('map.weatherPoint')}</Text><Pressable accessibilityLabel={t('map.close')} hitSlop={10} onPress={() => setTouched(null)}><MaterialIcons name="close" size={22} color="#5F6368" /></Pressable></View>
                <View style={styles.infoMetrics}><View style={styles.infoMetric}><Text style={styles.infoLabel}>{t('map.wind')}</Text><Text style={styles.infoWind}>{touched.windSpeed.toFixed(0)} kt {touched.windDir}</Text></View><View style={styles.infoMetric}><Text style={styles.infoLabel}>{t('map.pressure')}</Text><Text style={styles.infoPressure}>{touched.pressure.toFixed(1)} hPa</Text></View></View>
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
            <SheetToggle icon="waves" title={t('map.showIsobars')} value={showIsobares} onValueChange={setShowIsobares} />
            <SheetToggle icon="air" title={t('map.showWind')} value={showWind} onValueChange={setShowWind} />
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
    bottom: 168,
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
  timeline: { position: 'absolute', zIndex: 12, left: 16, right: 16, bottom: 90, minHeight: 66, borderRadius: 20, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.95)', elevation: 5, shadowColor: '#202124', shadowOpacity: 0.14, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  timelinePlay: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F1F3F4', alignItems: 'center', justifyContent: 'center' },
  timelineCopy: { flex: 1, gap: 7 },
  timelineLabels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timelineHour: { color: '#202124', fontSize: 14, fontWeight: '700' },
  timelineOnly: { color: '#80868B', fontSize: 11 },
  timelineTrack: { height: 4, borderRadius: 2, backgroundColor: '#DADCE0', justifyContent: 'center' },
  timelineDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#1967D2' },
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
