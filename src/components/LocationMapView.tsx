import React from 'react';
import MapView, { Marker } from 'react-native-maps';

import { theme } from '../theme';
import type { LocationMapViewProps } from './LocationMapView.types';

export default function LocationMapView({
  style,
  region,
  currentCoordinates,
  selectedCoordinates,
  selectedTitle,
  selectedDescription,
  onMapReady,
  onPress,
}: LocationMapViewProps) {
  return (
    <MapView
      style={style}
      region={region}
      onMapReady={onMapReady}
      onPress={onPress}
    >
      {currentCoordinates ? (
        <Marker
          coordinate={currentCoordinates}
          title="Current location"
          pinColor={theme.colors.blue}
        />
      ) : null}
      {selectedCoordinates ? (
        <Marker
          coordinate={selectedCoordinates}
          title={selectedTitle}
          description={selectedDescription}
        />
      ) : null}
    </MapView>
  );
}
