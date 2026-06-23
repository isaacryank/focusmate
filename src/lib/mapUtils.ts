import { Linking } from 'react-native';

export type OpenMapsResult =
  | { ok: true; url: string }
  | { ok: false; reason: string };

export function buildMapsSearchUrl(location: string): string {
  const trimmedLocation = location.trim();

  if (!trimmedLocation) {
    return '';
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    trimmedLocation
  )}`;
}

export async function openLocationInMaps(
  location: string
): Promise<OpenMapsResult> {
  const mapsUrl = buildMapsSearchUrl(location);

  if (!mapsUrl) {
    return {
      ok: false,
      reason: 'Milo does not see a saved location for this item yet.',
    };
  }

  try {
    const canOpen = await Linking.canOpenURL(mapsUrl);

    if (!canOpen) {
      return {
        ok: false,
        reason: 'This device cannot open Maps for that location right now.',
      };
    }

    await Linking.openURL(mapsUrl);
    return {
      ok: true,
      url: mapsUrl,
    };
  } catch (error) {
    console.warn('Failed to open location in Maps:', error);
    return {
      ok: false,
      reason: 'Milo could not open Maps right now. Please try again in a moment.',
    };
  }
}
