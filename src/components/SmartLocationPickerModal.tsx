import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

import { theme } from '../theme';
import { useFocusMateTheme } from '../theme/FocusMateThemeProvider';
import {
  createCoordinatePlace,
  createManualPlace,
  formatLocationForTask,
  formatReverseGeocodeAddress,
  LocationCoordinates,
  LocationPlace,
  searchPlaces,
} from '../lib/locationPickerUtils';
import LocationMapView from './LocationMapView';
import type {
  LocationMapPressEvent,
  LocationMapRegion,
} from './LocationMapView.types';
import MiloMoodImage from './milo/MiloMoodImage';

type PermissionState =
  | 'checking'
  | 'undetermined'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'skipped';

type Props = {
  visible: boolean;
  initialLocation: string;
  recentLocations: string[];
  onCancel: () => void;
  onSave: (location: string, place: LocationPlace) => void;
};

const DEFAULT_REGION: LocationMapRegion = {
  latitude: 2.313,
  longitude: 102.318,
  latitudeDelta: 0.06,
  longitudeDelta: 0.06,
};

function regionFromCoordinates(
  coordinates: LocationCoordinates
): LocationMapRegion {
  return {
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    latitudeDelta: 0.015,
    longitudeDelta: 0.015,
  };
}

function getPlaceCoordinates(place?: LocationPlace | null) {
  if (
    place?.latitude === undefined ||
    place.longitude === undefined ||
    !Number.isFinite(place.latitude) ||
    !Number.isFinite(place.longitude)
  ) {
    return null;
  }

  return {
    latitude: place.latitude,
    longitude: place.longitude,
  };
}

export default function SmartLocationPickerModal({
  visible,
  initialLocation,
  recentLocations,
  onCancel,
  onSave,
}: Props) {
  useFocusMateTheme();

  const [query, setQuery] = useState('');
  const [selectedPlace, setSelectedPlace] = useState<LocationPlace | null>(null);
  const [searchResults, setSearchResults] = useState<LocationPlace[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');
  const [permissionState, setPermissionState] =
    useState<PermissionState>('checking');
  const [permissionMessage, setPermissionMessage] = useState('');
  const [currentCoordinates, setCurrentCoordinates] =
    useState<LocationCoordinates | null>(null);
  const [region, setRegion] = useState<LocationMapRegion>(DEFAULT_REGION);
  const [mapReady, setMapReady] = useState(false);
  const canRenderMap = Platform.OS !== 'web';

  const selectedCoordinates = getPlaceCoordinates(selectedPlace);
  const manualPlace = useMemo(() => createManualPlace(query), [query]);
  const saveCandidate = selectedPlace || manualPlace;
  const canSave = saveCandidate !== null;

  useEffect(() => {
    if (!visible) {
      return;
    }

    const trimmedInitialLocation = initialLocation.trim();

    setQuery(trimmedInitialLocation);
    setSelectedPlace(createManualPlace(trimmedInitialLocation));
    setSearchResults([]);
    setIsSearching(false);
    setHasSearched(false);
    setSearchMessage('');
    setPermissionMessage('');
    setMapReady(false);
  }, [initialLocation, visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    let isActive = true;

    async function checkPermission() {
      try {
        setPermissionState('checking');
        const permission = await Location.getForegroundPermissionsAsync();

        if (!isActive) {
          return;
        }

        setPermissionState(permission.status);

        if (permission.status === Location.PermissionStatus.GRANTED) {
          void loadCurrentLocation(false);
        }
      } catch {
        if (!isActive) {
          return;
        }

        setPermissionState('denied');
        setPermissionMessage(
          'Location permission is unavailable right now. You can still search or type a place.'
        );
      }
    }

    void checkPermission();

    return () => {
      isActive = false;
    };
  }, [visible]);

  const buildCoordinatePlace = async (
    coordinates: LocationCoordinates,
    source: 'current' | 'map'
  ) => {
    let address = '';

    try {
      const reverseResults = await Location.reverseGeocodeAsync(coordinates);
      address = formatReverseGeocodeAddress(reverseResults[0]);
    } catch {
      address = '';
    }

    return createCoordinatePlace({
      coordinates,
      name: source === 'current' ? 'Current location' : 'Pinned location',
      address,
      source,
    });
  };

  const loadCurrentLocation = async (selectCurrentPlace: boolean) => {
    try {
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coordinates = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };

      setCurrentCoordinates(coordinates);
      setRegion(regionFromCoordinates(coordinates));

      if (selectCurrentPlace) {
        const currentPlace = await buildCoordinatePlace(coordinates, 'current');
        setSelectedPlace(currentPlace);
        setQuery(currentPlace.address || currentPlace.name);
      }
    } catch {
      setPermissionMessage(
        'Milo could not get your current location. You can still search or type a place.'
      );
    }
  };

  const handleAllowLocation = async (
    selectCurrentPlace = !query.trim() && !selectedPlace
  ) => {
    try {
      setPermissionState('requesting');
      setPermissionMessage('');

      const permission = await Location.requestForegroundPermissionsAsync();
      setPermissionState(permission.status);

      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setPermissionMessage(
          'Location permission was not allowed. You can still search or type a place.'
        );
        return;
      }

      await loadCurrentLocation(selectCurrentPlace);
    } catch {
      setPermissionState('denied');
      setPermissionMessage(
        'Location permission failed. You can still search or type a place.'
      );
    }
  };

  const handleSkipLocation = () => {
    setPermissionState('skipped');
    setPermissionMessage(
      'No problem. Search and manual location entry still work.'
    );
  };

  const handleUseCurrentLocation = async () => {
    if (permissionState !== 'granted') {
      await handleAllowLocation(true);
      return;
    }

    await loadCurrentLocation(true);
  };

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setSearchMessage('');

    if (!selectedPlace) {
      return;
    }

    const normalizedValue = value.trim().toLowerCase();
    const selectedValues = [
      selectedPlace.name.trim().toLowerCase(),
      selectedPlace.address.trim().toLowerCase(),
      formatLocationForTask(selectedPlace).trim().toLowerCase(),
    ];

    if (!selectedValues.includes(normalizedValue)) {
      setSelectedPlace(null);
    }
  };

  const handleSearch = async () => {
    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 2) {
      setSearchMessage('Type at least 2 characters to search.');
      setSearchResults([]);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    setHasSearched(true);
    setSearchMessage('');

    try {
      const results = await searchPlaces(trimmedQuery, {
        userCoordinates: currentCoordinates || undefined,
      });

      setSearchResults(results);

      if (results.length === 0) {
        setSearchMessage(
          'No nearby places found. Try a more specific keyword or address.'
        );
      }
    } catch {
      setSearchResults([]);
      setSearchMessage(
        'Place search is unavailable right now. You can still save the typed location.'
      );
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectPlace = (place: LocationPlace) => {
    setSelectedPlace(place);
    setQuery(place.name);

    const coordinates = getPlaceCoordinates(place);

    if (coordinates) {
      setRegion(regionFromCoordinates(coordinates));
    }
  };

  const handleSelectRecent = (value: string) => {
    const recentPlace = createManualPlace(value, 'recent');

    if (!recentPlace) {
      return;
    }

    setQuery(value);
    setSelectedPlace(recentPlace);
    setSearchResults([]);
    setSearchMessage('');
  };

  const handleMapPress = async (event: LocationMapPressEvent) => {
    const coordinates = event.nativeEvent.coordinate;
    const pinnedPlace = await buildCoordinatePlace(coordinates, 'map');

    setSelectedPlace(pinnedPlace);
    setQuery(pinnedPlace.address || pinnedPlace.name);
    setRegion(regionFromCoordinates(coordinates));
  };

  const handleSave = () => {
    if (!saveCandidate) {
      return;
    }

    onSave(formatLocationForTask(saveCandidate), saveCandidate);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        <View style={styles.sheet}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <View style={styles.miloBadge}>
                <MiloMoodImage mood="happy" size={48} />
              </View>
              <View style={styles.headerCopy}>
                <Text style={styles.title}>Set Location</Text>
                <Text style={styles.helperText}>
                  Choose a place for this task. Search for a place or pick it
                  from the map.
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.closeButton}
                onPress={onCancel}
                accessibilityRole="button"
                accessibilityLabel="Close location picker"
              >
                <Ionicons name="close" size={18} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            {permissionState === 'undetermined' ? (
              <View style={styles.permissionCard}>
                <View style={styles.permissionIcon}>
                  <Ionicons
                    name="navigate-outline"
                    size={18}
                    color={theme.colors.primaryDark}
                  />
                </View>
                <View style={styles.permissionCopy}>
                  <Text style={styles.permissionTitle}>
                    Allow FocusMate to use your location for easier place
                    selection?
                  </Text>
                  <View style={styles.permissionActions}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={styles.permissionSecondaryButton}
                      onPress={handleSkipLocation}
                    >
                      <Text style={styles.permissionSecondaryText}>Not now</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={styles.permissionPrimaryButton}
                      onPress={() => void handleAllowLocation()}
                    >
                      <Text style={styles.permissionPrimaryText}>Allow</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ) : null}

            {permissionState === 'requesting' ? (
              <View style={styles.inlineStatus}>
                <ActivityIndicator size="small" color={theme.colors.primaryDark} />
                <Text style={styles.inlineStatusText}>
                  Checking location permission...
                </Text>
              </View>
            ) : null}

            {permissionMessage ? (
              <View style={styles.infoCard}>
                <Ionicons
                  name="information-circle-outline"
                  size={17}
                  color={theme.colors.primaryDark}
                />
                <Text style={styles.infoText}>{permissionMessage}</Text>
              </View>
            ) : null}

            <View style={styles.searchRow}>
              <View style={styles.searchInputWrap}>
                <Ionicons
                  name="search-outline"
                  size={17}
                  color={theme.colors.muted}
                />
                <TextInput
                  value={query}
                  onChangeText={handleQueryChange}
                  onSubmitEditing={handleSearch}
                  returnKeyType="search"
                  placeholder="Search place or address"
                  placeholderTextColor={theme.colors.muted}
                  style={styles.searchInput}
                />
              </View>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.searchButton}
                onPress={handleSearch}
                disabled={isSearching}
              >
                {isSearching ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.searchButtonText}>Search</Text>
                )}
              </TouchableOpacity>
            </View>

            {canRenderMap ? (
              <View style={styles.mapWrap}>
                <LocationMapView
                  style={styles.map}
                  region={region}
                  onMapReady={() => setMapReady(true)}
                  onPress={handleMapPress}
                  currentCoordinates={currentCoordinates}
                  selectedCoordinates={selectedCoordinates}
                  selectedTitle={selectedPlace?.name || 'Selected place'}
                  selectedDescription={selectedPlace?.address}
                />
                {!mapReady ? (
                  <View style={styles.mapLoading}>
                    <ActivityIndicator
                      size="small"
                      color={theme.colors.primaryDark}
                    />
                    <Text style={styles.mapLoadingText}>Map preview loading</Text>
                  </View>
                ) : null}
                <TouchableOpacity
                  activeOpacity={0.86}
                  style={styles.currentLocationButton}
                  onPress={handleUseCurrentLocation}
                  accessibilityRole="button"
                  accessibilityLabel="Use current location"
                >
                  <Ionicons
                    name="locate-outline"
                    size={19}
                    color={theme.colors.primaryDark}
                  />
                </TouchableOpacity>
                <Text style={styles.mapHint}>
                  Tap the map to drop a pin. Search results use OpenStreetMap.
                </Text>
              </View>
            ) : (
              <View style={styles.mapFallback}>
                <Ionicons
                  name="map-outline"
                  size={18}
                  color={theme.colors.primaryDark}
                />
                <Text style={styles.mapFallbackText}>
                  Map preview is not available on this platform. You can still
                  search or save a typed location.
                </Text>
              </View>
            )}

            {searchResults.length > 0 ? (
              <View style={styles.resultsCard}>
                <Text style={styles.sectionTitle}>Search Results</Text>
                {searchResults.map((place) => {
                  const isSelected = selectedPlace?.id === place.id;

                  return (
                    <TouchableOpacity
                      key={place.id}
                      activeOpacity={0.86}
                      style={[
                        styles.resultRow,
                        isSelected && styles.resultRowSelected,
                      ]}
                      onPress={() => handleSelectPlace(place)}
                    >
                      <View style={styles.resultIcon}>
                        <Ionicons
                          name="location-outline"
                          size={16}
                          color={theme.colors.primaryDark}
                        />
                      </View>
                      <View style={styles.resultCopy}>
                        <Text numberOfLines={1} style={styles.resultName}>
                          {place.name}
                        </Text>
                        <Text numberOfLines={2} style={styles.resultAddress}>
                          {place.address || 'Address unavailable'}
                        </Text>
                        {place.distanceLabel ? (
                          <Text style={styles.distanceText}>
                            {place.distanceLabel}
                          </Text>
                        ) : null}
                      </View>
                      {isSelected ? (
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color={theme.colors.primaryDark}
                        />
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}

            {searchMessage ? (
              <View style={styles.infoCard}>
                <Ionicons
                  name={hasSearched ? 'search-outline' : 'information-circle-outline'}
                  size={17}
                  color={theme.colors.primaryDark}
                />
                <Text style={styles.infoText}>{searchMessage}</Text>
              </View>
            ) : null}

            {recentLocations.length > 0 ? (
              <View style={styles.recentSection}>
                <Text style={styles.sectionTitle}>Recent Places</Text>
                <View style={styles.recentRow}>
                  {recentLocations.map((item) => (
                    <TouchableOpacity
                      key={item}
                      activeOpacity={0.85}
                      style={styles.recentChip}
                      onPress={() => handleSelectRecent(item)}
                    >
                      <Text numberOfLines={1} style={styles.recentChipText}>
                        {item}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null}

            {saveCandidate ? (
              <View style={styles.selectedCard}>
                <View style={styles.selectedIcon}>
                  <Ionicons
                    name="checkmark-circle"
                    size={19}
                    color={theme.colors.primaryDark}
                  />
                </View>
                <View style={styles.selectedCopy}>
                  <Text style={styles.selectedLabel}>Selected place</Text>
                  <Text numberOfLines={1} style={styles.selectedName}>
                    {saveCandidate.name}
                  </Text>
                  <Text numberOfLines={2} style={styles.selectedAddress}>
                    {saveCandidate.address}
                  </Text>
                </View>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.actionRow}>
            <TouchableOpacity
              activeOpacity={0.86}
              style={styles.cancelButton}
              onPress={onCancel}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.86}
              style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={!canSave}
            >
              <Text style={styles.saveButtonText}>Save Location</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(34, 40, 49, 0.28)',
    padding: 14,
  },
  sheet: {
    maxHeight: '92%',
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 15,
    ...theme.shadow,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  miloBadge: {
    width: 56,
    height: 56,
    borderRadius: 22,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 4,
  },
  helperText: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.backgroundSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  permissionCard: {
    flexDirection: 'row',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#CFEFDA',
    backgroundColor: theme.colors.primarySoft,
    padding: 12,
    marginBottom: 12,
  },
  permissionIcon: {
    width: 34,
    height: 34,
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  permissionCopy: {
    flex: 1,
  },
  permissionTitle: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 17,
  },
  permissionActions: {
    flexDirection: 'row',
    marginTop: 10,
  },
  permissionSecondaryButton: {
    minHeight: 34,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 13,
    marginRight: 8,
  },
  permissionSecondaryText: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '900',
  },
  permissionPrimaryButton: {
    minHeight: 34,
    borderRadius: 13,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 15,
  },
  permissionPrimaryText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  inlineStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: theme.colors.backgroundSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 10,
    marginBottom: 10,
  },
  inlineStatusText: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 8,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: theme.colors.backgroundSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 10,
    marginTop: 10,
  },
  infoText: {
    flex: 1,
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    marginLeft: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  searchInputWrap: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.backgroundSoft,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
    paddingVertical: 8,
    marginLeft: 7,
  },
  searchButton: {
    width: 76,
    minHeight: 44,
    borderRadius: 15,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  searchButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  mapWrap: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    backgroundColor: theme.colors.backgroundSoft,
    marginBottom: 12,
  },
  map: {
    height: 174,
  },
  mapLoading: {
    ...StyleSheet.absoluteFillObject,
    height: 174,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
  },
  mapLoadingText: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 7,
  },
  currentLocationButton: {
    position: 'absolute',
    right: 10,
    top: 10,
    width: 38,
    height: 38,
    borderRadius: 15,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadowSoft,
  },
  mapHint: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  mapFallback: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: '#CFEFDA',
    padding: 12,
    marginBottom: 12,
  },
  mapFallbackText: {
    flex: 1,
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    marginLeft: 8,
  },
  resultsCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    marginBottom: 12,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 8,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    padding: 11,
  },
  resultRowSelected: {
    backgroundColor: theme.colors.primarySoft,
  },
  resultIcon: {
    width: 32,
    height: 32,
    borderRadius: 13,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },
  resultCopy: {
    flex: 1,
  },
  resultName: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 3,
  },
  resultAddress: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  distanceText: {
    color: theme.colors.primaryDark,
    fontSize: 11,
    fontWeight: '900',
    marginTop: 4,
  },
  recentSection: {
    marginBottom: 10,
  },
  recentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  recentChip: {
    borderRadius: 16,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: '#CFEFDA',
    paddingHorizontal: 11,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
    maxWidth: '100%',
  },
  recentChipText: {
    color: theme.colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
  },
  selectedCard: {
    flexDirection: 'row',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#CFEFDA',
    backgroundColor: theme.colors.primarySoft,
    padding: 12,
    marginBottom: 4,
  },
  selectedIcon: {
    width: 34,
    height: 34,
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  selectedCopy: {
    flex: 1,
  },
  selectedLabel: {
    color: theme.colors.primaryDark,
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 3,
  },
  selectedName: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 3,
  },
  selectedAddress: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  cancelButton: {
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    marginRight: 9,
  },
  cancelButtonText: {
    color: theme.colors.textSoft,
    fontSize: 13,
    fontWeight: '900',
  },
  saveButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  saveButtonDisabled: {
    backgroundColor: '#BFD7C7',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
});
