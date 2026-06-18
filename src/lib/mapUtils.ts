import { Linking } from 'react-native';

export function buildMapsSearchUrl(location: string): string {
  const trimmedLocation = location.trim();

  if (!trimmedLocation) {
    return '';
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    trimmedLocation
  )}`;
}

export async function openLocationInMaps(location: string): Promise<void> {
  const mapsUrl = buildMapsSearchUrl(location);

  if (!mapsUrl) {
    return;
  }

  try {
    await Linking.openURL(mapsUrl);
  } catch (error) {
    console.warn('Failed to open location in Maps:', error);
  }
}
