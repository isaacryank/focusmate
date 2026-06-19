export type LocationCoordinates = {
  latitude: number;
  longitude: number;
};

export type LocationPlaceSource = 'search' | 'manual' | 'recent' | 'current' | 'map';

export type LocationPlace = {
  id: string;
  name: string;
  address: string;
  latitude?: number;
  longitude?: number;
  distanceLabel?: string;
  importance?: number;
  source: LocationPlaceSource;
};

export type ReverseGeocodeAddress = {
  name?: string | null;
  street?: string | null;
  district?: string | null;
  subregion?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
};

type NominatimSearchItem = {
  place_id?: number;
  osm_id?: number;
  osm_type?: string;
  class?: string;
  type?: string;
  display_name?: string;
  name?: string;
  lat?: string;
  lon?: string;
  importance?: number;
  address?: Record<string, string | undefined>;
};

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const SEARCH_TIMEOUT_MS = 8000;
const EARTH_RADIUS_METERS = 6371000;
const DEFAULT_SEARCH_COUNTRY_CODE = 'my';
const DEFAULT_SEARCH_LIMIT = 8;
const DEFAULT_NEARBY_SEARCH_RADII_KM = [15, 30, 50];
const BROAD_PLACE_TYPES = new Set([
  'country',
  'state',
  'region',
  'county',
  'district',
  'municipality',
  'city',
  'town',
  'village',
  'suburb',
]);
const PHYSICAL_RESULT_CLASSES = new Set([
  'amenity',
  'building',
  'healthcare',
  'leisure',
  'office',
  'shop',
  'tourism',
]);
const ONLINE_LOCATION_PATTERNS = [
  /^https?:\/\//i,
  /meet\.google\.com/i,
  /\bgoogle\s+meet\b/i,
  /\bms\s+teams\b/i,
  /\bmicrosoft\s+teams\b/i,
  /teams\.microsoft\.com/i,
  /\bzoom\b/i,
  /zoom\.us/i,
  /\bwebex\b/i,
  /\bdiscord\b/i,
  /\bwhatsapp\s+call\b/i,
];

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeSearchQuery(query: string) {
  const compactQuery = query.trim().toLowerCase().replace(/[.\s-]/g, '');

  if (compactQuery === 'diy' || compactQuery === 'mrdiy') {
    return 'mr diy';
  }

  return query;
}

function buildSearchViewbox(
  coordinates: LocationCoordinates,
  radiusKm: number
) {
  const latitudeDelta = radiusKm / 111.32;
  const longitudeScale = Math.cos(toRadians(coordinates.latitude));
  const longitudeDelta =
    radiusKm / (111.32 * Math.max(Math.abs(longitudeScale), 0.01));
  const minLatitude = clamp(coordinates.latitude - latitudeDelta, -90, 90);
  const maxLatitude = clamp(coordinates.latitude + latitudeDelta, -90, 90);
  const minLongitude = clamp(coordinates.longitude - longitudeDelta, -180, 180);
  const maxLongitude = clamp(coordinates.longitude + longitudeDelta, -180, 180);

  return [
    minLongitude.toFixed(6),
    maxLatitude.toFixed(6),
    maxLongitude.toFixed(6),
    minLatitude.toFixed(6),
  ].join(',');
}

function formatDistance(meters: number) {
  if (meters < 1000) {
    const rounded = Math.max(50, Math.round(meters / 50) * 50);
    return `${rounded} m away`;
  }

  if (meters < 10000) {
    return `${(meters / 1000).toFixed(1)} km away`;
  }

  return `${Math.round(meters / 1000)} km away`;
}

function getDistanceMeters(
  from: LocationCoordinates,
  to: LocationCoordinates
) {
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const firstLatitude = toRadians(from.latitude);
  const secondLatitude = toRadians(to.latitude);

  const a =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) *
      Math.sin(longitudeDelta / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

function compactParts(parts: Array<string | null | undefined>) {
  const seen = new Set<string>();

  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => {
      if (!part) return false;

      const normalized = part.toLowerCase();
      if (seen.has(normalized)) return false;

      seen.add(normalized);
      return true;
    });
}

function getAddressName(item: NominatimSearchItem) {
  const address = item.address || {};

  return (
    item.name ||
    address.amenity ||
    address.shop ||
    address.office ||
    address.building ||
    address.school ||
    address.university ||
    address.road ||
    item.display_name?.split(',')[0]?.trim() ||
    'Place'
  );
}

function getShortAddress(item: NominatimSearchItem, name: string) {
  const displayName = item.display_name?.trim();

  if (!displayName) {
    return '';
  }

  if (displayName.toLowerCase().startsWith(`${name.toLowerCase()},`)) {
    return displayName.slice(name.length + 1).trim();
  }

  return displayName;
}

function hasValidCoordinates(place: LocationPlace) {
  return (
    place.latitude !== undefined &&
    place.longitude !== undefined &&
    Number.isFinite(place.latitude) &&
    Number.isFinite(place.longitude)
  );
}

function getPlaceDistanceMeters(
  from: LocationCoordinates,
  place: LocationPlace
) {
  if (!hasValidCoordinates(place)) {
    return Number.POSITIVE_INFINITY;
  }

  return getDistanceMeters(from, {
    latitude: place.latitude as number,
    longitude: place.longitude as number,
  });
}

function isPhysicalSearchResult(item: NominatimSearchItem) {
  const resultClass = item.class?.toLowerCase();

  if (resultClass && PHYSICAL_RESULT_CLASSES.has(resultClass)) {
    return true;
  }

  const address = item.address || {};

  return Boolean(
    address.amenity ||
      address.shop ||
      address.office ||
      address.building ||
      address.school ||
      address.university
  );
}

function isBroadSearchResult(item: NominatimSearchItem) {
  const resultClass = item.class?.toLowerCase();
  const resultType = item.type?.toLowerCase();

  if (resultClass === 'boundary') {
    return true;
  }

  return Boolean(
    resultClass === 'place' && resultType && BROAD_PLACE_TYPES.has(resultType)
  );
}

function hasPreferredSearchResult(items: NominatimSearchItem[]) {
  return items.some(
    (item) => isPhysicalSearchResult(item) || !isBroadSearchResult(item)
  );
}

function createSearchPlace(
  item: NominatimSearchItem,
  index: number,
  userCoordinates?: LocationCoordinates
): LocationPlace & {
  distanceMeters: number;
  isBroadResult: boolean;
  isPhysicalResult: boolean;
} {
  const latitude = Number(item.lat);
  const longitude = Number(item.lon);
  const hasCoordinates =
    Number.isFinite(latitude) && Number.isFinite(longitude);
  const name = getAddressName(item);
  const distanceMeters =
    userCoordinates && hasCoordinates
      ? getDistanceMeters(userCoordinates, { latitude, longitude })
      : Number.POSITIVE_INFINITY;

  return {
    id: String(item.place_id || item.osm_id || `${name}-${index}`),
    name,
    address: getShortAddress(item, name),
    latitude: hasCoordinates ? latitude : undefined,
    longitude: hasCoordinates ? longitude : undefined,
    importance: item.importance,
    distanceLabel:
      userCoordinates && Number.isFinite(distanceMeters)
        ? formatDistance(distanceMeters)
        : undefined,
    source: 'search',
    distanceMeters,
    isBroadResult: isBroadSearchResult(item),
    isPhysicalResult: isPhysicalSearchResult(item),
  };
}

function refineSearchResults(
  items: NominatimSearchItem[],
  userCoordinates: LocationCoordinates | undefined,
  limit: number
) {
  const places = items.map((item, index) =>
    createSearchPlace(item, index, userCoordinates)
  );
  const preferredPlaces = places.filter(
    (place) => place.isPhysicalResult || !place.isBroadResult
  );
  const qualityFilteredPlaces =
    preferredPlaces.length > 0 ? preferredPlaces : places;

  return qualityFilteredPlaces
    .sort((firstPlace, secondPlace) => {
      if (userCoordinates) {
        const distanceDifference =
          getPlaceDistanceMeters(userCoordinates, firstPlace) -
          getPlaceDistanceMeters(userCoordinates, secondPlace);

        if (distanceDifference !== 0) {
          return distanceDifference;
        }
      }

      if (firstPlace.isPhysicalResult !== secondPlace.isPhysicalResult) {
        return firstPlace.isPhysicalResult ? -1 : 1;
      }

      if (firstPlace.isBroadResult !== secondPlace.isBroadResult) {
        return firstPlace.isBroadResult ? 1 : -1;
      }

      return (secondPlace.importance || 0) - (firstPlace.importance || 0);
    })
    .slice(0, limit)
    .map(
      ({
        distanceMeters: _distanceMeters,
        isBroadResult: _isBroadResult,
        isPhysicalResult: _isPhysicalResult,
        ...place
      }) => place
    );
}

async function requestNominatimSearch(params: URLSearchParams) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${NOMINATIM_SEARCH_URL}?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en',
        'User-Agent': 'FocusMateFYP/1.0 location picker',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Place search failed with ${response.status}`);
    }

    return (await response.json()) as NominatimSearchItem[];
  } finally {
    clearTimeout(timeout);
  }
}

export function createManualPlace(
  value: string,
  source: Extract<LocationPlaceSource, 'manual' | 'recent'> = 'manual'
): LocationPlace | null {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  return {
    id: `${source}-${trimmedValue.toLowerCase()}`,
    name: trimmedValue,
    address: source === 'recent' ? 'Recent place' : 'Manual location',
    source,
  };
}

export function isPhysicalLocationLikeValue(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return false;
  }

  return !ONLINE_LOCATION_PATTERNS.some((pattern) => pattern.test(trimmedValue));
}

export function createCoordinatePlace({
  coordinates,
  name,
  address,
  source,
}: {
  coordinates: LocationCoordinates;
  name: string;
  address?: string;
  source: Extract<LocationPlaceSource, 'current' | 'map'>;
}): LocationPlace {
  return {
    id: `${source}-${coordinates.latitude.toFixed(6)}-${coordinates.longitude.toFixed(6)}`,
    name,
    address:
      address?.trim() ||
      `${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}`,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    source,
  };
}

export function formatReverseGeocodeAddress(address?: ReverseGeocodeAddress) {
  if (!address) {
    return '';
  }

  return compactParts([
    address.name,
    address.street,
    address.district,
    address.subregion,
    address.city,
    address.region,
    address.postalCode,
    address.country,
  ]).join(', ');
}

export function formatLocationForTask(place: LocationPlace) {
  const name = place.name.trim();
  const address = place.address.trim();

  if (!address || address === 'Manual location' || address === 'Recent place') {
    return name;
  }

  if (address.toLowerCase() === name.toLowerCase()) {
    return name;
  }

  if (place.source === 'current' || place.source === 'map') {
    return address;
  }

  return `${name} - ${address}`;
}

export async function searchPlaces(
  query: string,
  {
    userCoordinates,
    countryCode = DEFAULT_SEARCH_COUNTRY_CODE,
    limit = DEFAULT_SEARCH_LIMIT,
    nearbySearchRadiiKm = DEFAULT_NEARBY_SEARCH_RADII_KM,
  }: {
    userCoordinates?: LocationCoordinates;
    countryCode?: string;
    limit?: number;
    nearbySearchRadiiKm?: number[];
  } = {}
) {
  const trimmedQuery = query.trim();

  if (trimmedQuery.length < 2) {
    return [];
  }

  const baseParams = new URLSearchParams({
    q: normalizeSearchQuery(trimmedQuery),
    format: 'jsonv2',
    addressdetails: '1',
    limit: String(limit),
    dedupe: '1',
  });

  if (countryCode.trim()) {
    baseParams.set('countrycodes', countryCode.trim().toLowerCase());
  }

  if (userCoordinates) {
    for (const radiusKm of nearbySearchRadiiKm) {
      const nearbyParams = new URLSearchParams(baseParams);
      nearbyParams.set('viewbox', buildSearchViewbox(userCoordinates, radiusKm));
      nearbyParams.set('bounded', '1');

      const nearbyData = await requestNominatimSearch(nearbyParams);
      const nearbyPlaces = refineSearchResults(
        nearbyData,
        userCoordinates,
        limit
      );

      if (nearbyPlaces.length > 0 && hasPreferredSearchResult(nearbyData)) {
        return nearbyPlaces;
      }
    }
  }

  const malaysiaWideData = await requestNominatimSearch(baseParams);

  return refineSearchResults(malaysiaWideData, userCoordinates, limit);
}
