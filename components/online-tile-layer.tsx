import { useEffect } from 'react';

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
};

// Le web et Expo Go conservent le fond embarqué : aucun appel direct aux serveurs
// raster d'OpenStreetMap n'est effectué.
export function OnlineTileLayer({ onAvailabilityChange }: Props) {
  useEffect(() => {
    onAvailabilityChange?.(false);
  }, [onAvailabilityChange]);

  return null;
}
