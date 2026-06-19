import { Linking } from 'react-native';

export type OnlineMeetingProvider =
  | 'Google Meet'
  | 'Microsoft Teams'
  | 'Zoom'
  | 'Webex'
  | 'Discord'
  | 'WhatsApp'
  | 'Custom';

const URL_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
const DOMAIN_LIKE_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+(?:[/:?#].*)?$/i;
const APP_LINK_PATTERN = /^(whatsapp|zoommtg|msteams|discord):\/\//i;

function getHost(value: string) {
  const withoutScheme = value.replace(URL_SCHEME_PATTERN, '');
  const host = withoutScheme.split(/[/?#]/)[0]?.trim().toLowerCase() || '';

  return host.replace(/^www\./, '');
}

function hostMatches(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}

export function normalizeMeetingUrl(input: string): string {
  const trimmedInput = input.trim();

  if (!trimmedInput) {
    return '';
  }

  if (URL_SCHEME_PATTERN.test(trimmedInput)) {
    return trimmedInput;
  }

  if (DOMAIN_LIKE_PATTERN.test(trimmedInput)) {
    return `https://${trimmedInput}`;
  }

  return trimmedInput;
}

export function detectMeetingProvider(url: string): OnlineMeetingProvider {
  const normalizedUrl = normalizeMeetingUrl(url);
  const lowerUrl = normalizedUrl.toLowerCase();
  const host = getHost(normalizedUrl);

  if (hostMatches(host, 'meet.google.com') || /\bgoogle\s+meet\b/i.test(url)) {
    return 'Google Meet';
  }

  if (
    hostMatches(host, 'teams.microsoft.com') ||
    lowerUrl.startsWith('msteams://') ||
    /\b(ms\s+teams|microsoft\s+teams)\b/i.test(url)
  ) {
    return 'Microsoft Teams';
  }

  if (
    hostMatches(host, 'zoom.us') ||
    hostMatches(host, 'zoomgov.com') ||
    lowerUrl.startsWith('zoommtg://') ||
    /\bzoom\b/i.test(url)
  ) {
    return 'Zoom';
  }

  if (hostMatches(host, 'webex.com') || /\bwebex\b/i.test(url)) {
    return 'Webex';
  }

  if (
    hostMatches(host, 'discord.gg') ||
    hostMatches(host, 'discord.com') ||
    lowerUrl.startsWith('discord://') ||
    /\bdiscord\b/i.test(url)
  ) {
    return 'Discord';
  }

  if (
    hostMatches(host, 'wa.me') ||
    hostMatches(host, 'whatsapp.com') ||
    lowerUrl.startsWith('whatsapp://') ||
    /\bwhatsapp\b/i.test(url)
  ) {
    return 'WhatsApp';
  }

  return 'Custom';
}

export function isLikelyMeetingUrl(input: string): boolean {
  const normalizedUrl = normalizeMeetingUrl(input);

  if (!normalizedUrl || /\s/.test(normalizedUrl)) {
    return false;
  }

  if (APP_LINK_PATTERN.test(normalizedUrl)) {
    return true;
  }

  if (!/^https?:\/\//i.test(normalizedUrl)) {
    return false;
  }

  return DOMAIN_LIKE_PATTERN.test(normalizedUrl.replace(/^https?:\/\//i, ''));
}

export function buildMeetingDisplayLabel(url: string): string {
  const normalizedUrl = normalizeMeetingUrl(url);

  if (!normalizedUrl) {
    return '';
  }

  if (/^whatsapp:\/\//i.test(normalizedUrl)) {
    return 'WhatsApp link';
  }

  const host = getHost(normalizedUrl);

  return host || normalizedUrl;
}

export async function openMeetingLink(url: string): Promise<void> {
  const normalizedUrl = normalizeMeetingUrl(url);

  if (!isLikelyMeetingUrl(normalizedUrl)) {
    return;
  }

  try {
    await Linking.openURL(normalizedUrl);
  } catch (error) {
    console.warn('Failed to open online meeting link:', error);
  }
}
