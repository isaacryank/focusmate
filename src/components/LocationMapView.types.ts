import type { StyleProp, ViewStyle } from 'react-native';

import type { LocationCoordinates } from '../lib/locationPickerUtils';

export type LocationMapRegion = LocationCoordinates & {
  latitudeDelta: number;
  longitudeDelta: number;
};

export type LocationMapPressEvent = {
  nativeEvent: {
    coordinate: LocationCoordinates;
  };
};

export type LocationMapViewProps = {
  style: StyleProp<ViewStyle>;
  region: LocationMapRegion;
  currentCoordinates: LocationCoordinates | null;
  selectedCoordinates: LocationCoordinates | null;
  selectedTitle: string;
  selectedDescription?: string;
  onMapReady: () => void;
  onPress: (event: LocationMapPressEvent) => void;
};
