export const mainHeader = {
  screenPaddingHorizontal: 20,
  topPadding: 12,
  marginBottom: 16,
  minHeight: 64,
  titleFontSize: 34,
  titleLineHeight: 40,
  titleFontWeight: '900',
  subtitleFontSize: 15,
  subtitleLineHeight: 21,
  subtitleFontWeight: '700',
  greetingFontWeight: '800',
  actionGap: 10,
  textToActionsGap: 12,
} as const;

export const headerActionButton = {
  size: 48,
  radius: 24,
  iconSize: 23,
  borderWidth: 1.2,
  bottomBorderWidth: 1.8,
  shadowHeight: 8,
  shadowOpacity: 0.12,
  shadowRadius: 14,
  elevation: 4,
} as const;

export const headerBadge = {
  minWidth: 18,
  height: 18,
  radius: 9,
  top: -1,
  right: -1,
  paddingHorizontal: 4,
  borderWidth: 2,
  fontSize: 10,
} as const;

export const secondaryHeader = {
  minHeight: 56,
  marginBottom: 16,
  buttonSize: 48,
  buttonRadius: 24,
  iconSize: 24,
  titleFontSize: 21,
  titleLineHeight: 26,
  titleFontWeight: '900',
  sideGap: 12,
} as const;
