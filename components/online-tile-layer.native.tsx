import { Camera, Map, UserLocation, type ViewStateChangeEvent } from '@maplibre/maplibre-react-native';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

const OPEN_FREE_MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';

type Props = {
  width: number;
  height: number;
  west: number;
  east: number;
  south: number;
  north: number;
  onAvailabilityChange?: (available: boolean) => void;
  onViewportChange?: (bounds: [number, number, number, number]) => void;
  onMapPress?: (longitude: number, latitude: number) => void;
  onInteractionChange?: (moving: boolean) => void;
  showUserLocation?: boolean;
};

export function OnlineTileLayer({ width, height, west, east, south, north, onAvailabilityChange, onViewportChange, onMapPress, onInteractionChange, showUserLocation }: Props) {
  useEffect(() => {
    onAvailabilityChange?.(false);
  }, [east, height, north, onAvailabilityChange, south, west, width]);

  return (
    <View style={[styles.container, { width, height }]}>
      <Map
        mapStyle={OPEN_FREE_MAP_STYLE}
        attribution
        attributionPosition={{ top: 5, right: 5 }}
        logo={false}
        compass={false}
        dragPan
        touchZoom
        doubleTapZoom
        doubleTapHoldZoom
        touchRotate={false}
        touchPitch={false}
        onDidFinishLoadingMap={() => onAvailabilityChange?.(true)}
        onDidFailLoadingMap={() => onAvailabilityChange?.(false)}
        onRegionWillChange={(event) => {
          if ((event.nativeEvent as ViewStateChangeEvent).userInteraction) onInteractionChange?.(true);
        }}
        onRegionDidChange={(event) => {
          onViewportChange?.((event.nativeEvent as ViewStateChangeEvent).bounds);
          onInteractionChange?.(false);
        }}
        onPress={(event) => {
          const [longitude, latitude] = event.nativeEvent.lngLat;
          onMapPress?.(longitude, latitude);
        }}
        style={styles.map}
      >
        <Camera
          initialViewState={{
            bounds: [west, south, east, north],
            padding: { top: 0, right: 0, bottom: 0, left: 0 },
            bearing: 0,
            pitch: 0,
          }}
        />
        {showUserLocation && <UserLocation animated accuracy minDisplacement={2} />}
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
});
