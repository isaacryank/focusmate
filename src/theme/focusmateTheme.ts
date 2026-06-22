export type FocusMateThemePreference = 'system' | 'light' | 'dark';
export type FocusMateResolvedTheme = 'light' | 'dark';

type FocusMateColorKey =
  | 'background'
  | 'backgroundSoft'
  | 'surface'
  | 'surfaceSoft'
  | 'card'
  | 'cardSoft'
  | 'text'
  | 'textSoft'
  | 'muted'
  | 'mutedText'
  | 'subtleText'
  | 'primary'
  | 'primarySoft'
  | 'primaryDark'
  | 'border'
  | 'divider'
  | 'input'
  | 'inputBorder'
  | 'success'
  | 'successSoft'
  | 'warning'
  | 'warningSoft'
  | 'danger'
  | 'dangerSoft'
  | 'overlay'
  | 'shadow'
  | 'white'
  | 'yellow'
  | 'yellowSoft'
  | 'blue'
  | 'blueSoft'
  | 'purple'
  | 'purpleSoft'
  | 'incomingBubble'
  | 'outgoingBubble'
  | 'chatBackground';

export type FocusMateTheme = {
  colors: Record<FocusMateColorKey, string>;
  radius: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
    pill: number;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  typography: {
    title: number;
    sectionTitle: number;
    body: number;
    small: number;
  };
  shadow: {
    shadowColor: string;
    shadowOffset: {
      width: number;
      height: number;
    };
    shadowOpacity: number;
    shadowRadius: number;
    elevation: number;
  };
  shadowSoft: {
    shadowColor: string;
    shadowOffset: {
      width: number;
      height: number;
    };
    shadowOpacity: number;
    shadowRadius: number;
    elevation: number;
  };
};

const sharedThemeShape = {
  radius: {
    sm: 10,
    md: 16,
    lg: 22,
    xl: 30,
    pill: 999,
  },
  spacing: {
    xs: 6,
    sm: 10,
    md: 16,
    lg: 22,
    xl: 30,
  },
  typography: {
    title: 30,
    sectionTitle: 20,
    body: 14,
    small: 12,
  },
};

export const focusmateLightTheme: FocusMateTheme = {
  ...sharedThemeShape,
  colors: {
    background: '#F4FBF1',
    backgroundSoft: '#EFF8EE',
    surface: '#FFFFFF',
    surfaceSoft: '#EEF8E8',
    card: '#FFFFFF',
    cardSoft: '#EEF8E8',
    text: '#1F2A24',
    textSoft: '#6B7280',
    muted: '#8A948D',
    mutedText: '#6B7280',
    subtleText: '#8A948D',
    primary: '#2F8F46',
    primarySoft: '#E5F6E9',
    primaryDark: '#236B35',
    border: '#DDE8D5',
    divider: '#E7EEE2',
    input: '#FFFFFF',
    inputBorder: '#D6E3CE',
    success: '#22A55A',
    successSoft: '#EAFBF0',
    warning: '#F59E0B',
    warningSoft: '#FFF6D9',
    danger: '#DC2626',
    dangerSoft: '#FFF0F0',
    overlay: 'rgba(0, 0, 0, 0.35)',
    shadow: 'rgba(36, 70, 42, 0.22)',
    white: '#FFFFFF',
    yellow: '#F4C542',
    yellowSoft: '#FFF6D9',
    blue: '#4D9DE0',
    blueSoft: '#EAF4FF',
    purple: '#8B6FD9',
    purpleSoft: '#F0ECFF',
    incomingBubble: '#FFFFFF',
    outgoingBubble: '#DCF8C6',
    chatBackground: '#F7FAF2',
  },
  shadow: {
    shadowColor: 'rgba(36, 70, 42, 0.22)',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 7,
  },
  shadowSoft: {
    shadowColor: 'rgba(36, 70, 42, 0.18)',
    shadowOffset: {
      width: 0,
      height: 7,
    },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 5,
  },
};

export const focusmateDarkTheme: FocusMateTheme = {
  ...sharedThemeShape,
  colors: {
    background: '#001F17',
    backgroundSoft: '#063326',
    surface: '#1F2A2E',
    surfaceSoft: '#24333A',
    card: '#24333A',
    cardSoft: '#2B3B42',
    text: '#F3FBF7',
    textSoft: '#C9D8D2',
    muted: '#9FB2AB',
    mutedText: '#C9D8D2',
    subtleText: '#9FB2AB',
    primary: '#00A884',
    primarySoft: 'rgba(0, 168, 132, 0.16)',
    primaryDark: '#00B894',
    border: 'rgba(194, 224, 210, 0.14)',
    divider: 'rgba(194, 224, 210, 0.1)',
    input: '#1F2A2E',
    inputBorder: 'rgba(194, 224, 210, 0.18)',
    success: '#00A884',
    successSoft: 'rgba(0, 168, 132, 0.15)',
    warning: '#FFC94A',
    warningSoft: 'rgba(255, 201, 74, 0.15)',
    danger: '#FF6B6B',
    dangerSoft: 'rgba(255, 107, 107, 0.14)',
    overlay: 'rgba(0, 12, 9, 0.68)',
    shadow: 'rgba(0, 168, 132, 0.28)',
    white: '#FFFFFF',
    yellow: '#FFC94A',
    yellowSoft: 'rgba(255, 201, 74, 0.15)',
    blue: '#65B7FF',
    blueSoft: 'rgba(101, 183, 255, 0.14)',
    purple: '#B99CFF',
    purpleSoft: 'rgba(185, 156, 255, 0.15)',
    incomingBubble: '#24333A',
    outgoingBubble: '#005C4B',
    chatBackground: '#001F17',
  },
  shadow: {
    shadowColor: 'rgba(0, 168, 132, 0.28)',
    shadowOffset: {
      width: 0,
      height: 12,
    },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 8,
  },
  shadowSoft: {
    shadowColor: 'rgba(0, 168, 132, 0.22)',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 5,
  },
};

let currentResolvedTheme: FocusMateResolvedTheme = 'light';
let currentTheme = focusmateLightTheme;

export function getCurrentFocusMateTheme() {
  return currentTheme;
}

export function getCurrentResolvedTheme() {
  return currentResolvedTheme;
}

export function setCurrentResolvedTheme(resolvedTheme: FocusMateResolvedTheme) {
  currentResolvedTheme = resolvedTheme;
  currentTheme =
    resolvedTheme === 'dark' ? focusmateDarkTheme : focusmateLightTheme;
}

function normalizeHex(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith('#')) return null;

  if (trimmed.length === 4) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }

  if (trimmed.length === 7 || trimmed.length === 9) {
    return trimmed.toUpperCase();
  }

  return null;
}

const baseColorTokenMap: Partial<Record<string, FocusMateColorKey>> = {
  '#F7F8FA': 'background',
  '#F7FAF2': 'background',
  '#0B141A': 'background',
  '#FBFCFD': 'backgroundSoft',
  '#FBFDF8': 'backgroundSoft',
  '#FFFFFF': 'card',
  '#111B21': 'surface',
  '#202C33': 'card',
  '#F0F8F3': 'cardSoft',
  '#EEF8E8': 'cardSoft',
  '#1F2C27': 'cardSoft',
  '#E7F8ED': 'primarySoft',
  '#E5F6E9': 'primarySoft',
  '#0B3B32': 'primarySoft',
  '#55C878': 'primary',
  '#2F8F46': 'primary',
  '#00A884': 'primary',
  '#2F9B59': 'primaryDark',
  '#236B35': 'primaryDark',
  '#008069': 'primaryDark',
  '#222831': 'text',
  '#1F2A24': 'text',
  '#E9EDEF': 'text',
  '#4B5563': 'mutedText',
  '#6B7280': 'mutedText',
  '#AEBAC1': 'mutedText',
  '#8A94A6': 'subtleText',
  '#8A948D': 'subtleText',
  '#8696A0': 'subtleText',
  '#E8EDF2': 'border',
  '#DDE8D5': 'border',
  '#2A3942': 'border',
  '#E7EEE2': 'divider',
  '#1F2C34': 'divider',
  '#D6E3CE': 'inputBorder',
  '#EF4444': 'danger',
  '#DC2626': 'danger',
  '#FF6B6B': 'danger',
  '#FFF0F0': 'dangerSoft',
  '#FFF5F5': 'dangerSoft',
  '#FFFAFA': 'dangerSoft',
  '#3A2024': 'dangerSoft',
  '#22C55E': 'success',
  '#22A55A': 'success',
  '#EAFBF0': 'successSoft',
  '#F4C542': 'yellow',
  '#FBBF24': 'warning',
  '#FFF6D9': 'yellowSoft',
  '#332A13': 'warningSoft',
  '#F59E0B': 'warning',
  '#FFF7ED': 'warningSoft',
  '#4D9DE0': 'blue',
  '#64B5F6': 'blue',
  '#EAF4FF': 'blueSoft',
  '#112C3D': 'blueSoft',
  '#8B6FD9': 'purple',
  '#8B5CF6': 'purple',
  '#B8A7FF': 'purple',
  '#F0ECFF': 'purpleSoft',
  '#F2ECFF': 'purpleSoft',
  '#261F36': 'purpleSoft',
  '#DCF8C6': 'outgoingBubble',
  '#005C4B': 'outgoingBubble',
};

const darkOnlyColorTokenMap: Partial<Record<string, FocusMateColorKey>> = {
  '#001F17': 'background',
  '#00251B': 'background',
  '#063326': 'backgroundSoft',
  '#F4FBF1': 'background',
  '#EFF8EE': 'backgroundSoft',
  '#F8FCF6': 'backgroundSoft',
  '#F7FAF5': 'card',
  '#F7FCF5': 'cardSoft',
  '#FAFCF8': 'card',
  '#FBFDF9': 'card',
  '#F5FBF4': 'card',
  '#F5FCF6': 'card',
  '#F5FCF7': 'card',
  '#FBFFFC': 'card',
  '#F8FFF9': 'card',
  '#F6FBF7': 'card',
  '#DDF6E7': 'cardSoft',
  '#DDF7E6': 'cardSoft',
  '#E8F3E5': 'cardSoft',
  '#E1EEDD': 'cardSoft',
  '#FDF7E9': 'border',
  '#DDF8E7': 'primarySoft',
  '#DDF8E4': 'primarySoft',
  '#D7EEDC': 'primarySoft',
  '#ECFAF0': 'primarySoft',
  '#E9F9EF': 'primarySoft',
  '#ECFBF2': 'primarySoft',
  '#E3F8EA': 'primarySoft',
  '#DDF7E5': 'primarySoft',
  '#D6E3CE': 'inputBorder',
  '#CFEFDA': 'border',
  '#DDEFD9': 'border',
  '#DDEDE0': 'border',
  '#DDE9D9': 'border',
  '#E1EEE4': 'border',
  '#E2ECDD': 'border',
  '#E1E8DF': 'border',
  '#EAF0E7': 'border',
  '#E7EFE4': 'border',
  '#DAE9DE': 'border',
  '#DCEBDF': 'border',
  '#D7EFD8': 'border',
  '#C9D8C7': 'border',
  '#BFD8C0': 'border',
  '#C6D8C6': 'border',
  '#BFD7C7': 'border',
  '#BFD4C4': 'border',
  '#FFF4F4': 'dangerSoft',
  '#FFECEF': 'dangerSoft',
  '#F8CACA': 'dangerSoft',
  '#FBD1D1': 'dangerSoft',
  '#F3B7B7': 'danger',
  '#F4B4B4': 'danger',
  '#C7F3D4': 'successSoft',
  '#FFC94A': 'warning',
  '#D97706': 'warning',
  '#D88916': 'warning',
  '#B7791F': 'warning',
  '#A16207': 'warning',
  '#9A6A00': 'warning',
  '#92400E': 'warning',
  '#FFF7E8': 'warningSoft',
  '#FFF5DE': 'warningSoft',
  '#FFF6DC': 'warningSoft',
  '#FFF1DF': 'warningSoft',
  '#FFF1E6': 'warningSoft',
  '#FFF9EB': 'warningSoft',
  '#FDE3B0': 'warningSoft',
  '#FED7AA': 'warningSoft',
  '#FDBA74': 'warning',
  '#FCD34D': 'warning',
  '#F7D391': 'warning',
  '#65B7FF': 'blue',
  '#1683F3': 'blue',
  '#2F80ED': 'blue',
  '#3F7DFF': 'blue',
  '#EAF1FF': 'blueSoft',
  '#EAF3FF': 'blueSoft',
  '#E7F2FF': 'blueSoft',
  '#EEF0FF': 'blueSoft',
  '#CFE4F3': 'blueSoft',
  '#B99CFF': 'purple',
  '#7C3AED': 'purple',
  '#6366F1': 'purple',
  '#F2EAFE': 'purpleSoft',
  '#D8CDF9': 'purpleSoft',
  '#D4C8FF': 'purpleSoft',
};

const backgroundLikeKeys = new Set([
  'backgroundColor',
  'borderBottomColor',
  'borderTopColor',
  'borderLeftColor',
  'borderRightColor',
]);

const borderLikeKeys = new Set([
  'borderColor',
  'borderBottomColor',
  'borderTopColor',
  'borderLeftColor',
  'borderRightColor',
]);

function rgbaWithAlpha(color: string, alpha: string) {
  const normalized = color.trim();
  return normalized.length === 7 ? `${normalized}${alpha}` : normalized;
}

function rgbaFromHex(color: string, alpha: string) {
  const normalized = color.trim();

  if (!/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
    return normalized;
  }

  const red = parseInt(normalized.slice(1, 3), 16);
  const green = parseInt(normalized.slice(3, 5), 16);
  const blue = parseInt(normalized.slice(5, 7), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function tokenWithRgbaAlpha(
  colorKey: FocusMateColorKey,
  alpha: string,
  appTheme: FocusMateTheme
) {
  const color = appTheme.colors[colorKey];
  return color.trim().startsWith('rgba(') ? color : rgbaFromHex(color, alpha);
}

function mapHexColor(styleKey: string, hex: string, appTheme: FocusMateTheme) {
  const alpha = hex.length === 9 ? hex.slice(7) : '';
  const baseHex = alpha ? hex.slice(0, 7) : hex;

  if (baseHex === '#FFFFFF') {
    if (styleKey === 'color' || styleKey === 'tintColor') {
      return appTheme.colors.white;
    }

    if (borderLikeKeys.has(styleKey)) {
      return appTheme.colors.border;
    }

    if (styleKey === 'backgroundColor') {
      return appTheme.colors.card;
    }
  }

  if (baseHex === '#000000' || baseHex === '#000') {
    if (styleKey === 'shadowColor') {
      return appTheme.colors.shadow;
    }

    if (styleKey === 'color') {
      return appTheme.colors.text;
    }
  }

  const token =
    getCurrentResolvedTheme() === 'dark'
      ? darkOnlyColorTokenMap[baseHex] || baseColorTokenMap[baseHex]
      : baseColorTokenMap[baseHex];
  if (!token) return hex;

  return alpha ? rgbaWithAlpha(appTheme.colors[token], alpha) : appTheme.colors[token];
}

function mapRgbaColor(styleKey: string, value: string, appTheme: FocusMateTheme) {
  const compact = value.replace(/\s+/g, '').toLowerCase();
  const resolvedTheme = getCurrentResolvedTheme();

  if (
    compact.startsWith('rgba(34,40,49,') ||
    compact.startsWith('rgba(0,0,0,')
  ) {
    if (styleKey === 'shadowColor') {
      return appTheme.colors.shadow;
    }

    if (backgroundLikeKeys.has(styleKey)) {
      return appTheme.colors.overlay;
    }
  }

  if (compact.startsWith('rgba(255,255,255,')) {
    if (resolvedTheme === 'dark') {
      const alpha = compact
        .replace('rgba(255,255,255,', '')
        .replace(')', '');
      return tokenWithRgbaAlpha('card', alpha, appTheme);
    }
  }

  if (compact.startsWith('rgba(32,44,51,')) {
    if (resolvedTheme === 'light') {
      const alpha = compact
        .replace('rgba(32,44,51,', '')
        .replace(')', '');
      return `rgba(255, 255, 255, ${alpha})`;
    }
  }

  if (resolvedTheme === 'dark') {
    const greenTintPrefixes = [
      'rgba(30,111,54,',
      'rgba(35,107,53,',
      'rgba(36,105,57,',
      'rgba(46,125,75,',
      'rgba(47,143,70,',
      'rgba(55,166,83,',
      'rgba(69,120,52,',
      'rgba(72,171,91,',
      'rgba(85,200,120,',
      'rgba(88,176,106,',
      'rgba(123,198,115,',
      'rgba(136,99,224,',
      'rgba(190,216,194,',
      'rgba(191,216,192,',
      'rgba(193,216,198,',
      'rgba(213,238,220,',
      'rgba(213,245,217,',
      'rgba(221,247,229,',
    ];

    if (greenTintPrefixes.some((prefix) => compact.startsWith(prefix))) {
      if (borderLikeKeys.has(styleKey)) {
        return appTheme.colors.border;
      }

      if (backgroundLikeKeys.has(styleKey)) {
        return appTheme.colors.primarySoft;
      }
    }

    if (
      compact.startsWith('rgba(255,246,217,') ||
      compact.startsWith('rgba(244,197,66,') ||
      compact.startsWith('rgba(245,158,11,')
    ) {
      if (borderLikeKeys.has(styleKey)) {
        return appTheme.colors.warning;
      }

      if (backgroundLikeKeys.has(styleKey)) {
        return appTheme.colors.warningSoft;
      }
    }

    if (
      compact.startsWith('rgba(220,38,38,') ||
      compact.startsWith('rgba(255,107,107,')
    ) {
      if (borderLikeKeys.has(styleKey)) {
        return appTheme.colors.danger;
      }

      if (backgroundLikeKeys.has(styleKey)) {
        return appTheme.colors.dangerSoft;
      }
    }
  }

  return value;
}

export function mapFocusMateStyleValue(styleKey: string, value: unknown): unknown {
  const appTheme = getCurrentFocusMateTheme();

  if (typeof value === 'string') {
    const namedColor = value.trim().toLowerCase();

    if (namedColor === 'white') {
      if (styleKey === 'color' || styleKey === 'tintColor') {
        return appTheme.colors.white;
      }

      return appTheme.colors.card;
    }

    if (namedColor === 'black') {
      if (styleKey === 'shadowColor') {
        return appTheme.colors.shadow;
      }

      return appTheme.colors.text;
    }

    const hex = normalizeHex(value);
    if (hex) {
      return mapHexColor(styleKey, hex, appTheme);
    }

    if (value.trim().toLowerCase().startsWith('rgba(')) {
      return mapRgbaColor(styleKey, value, appTheme);
    }
  }

  return value;
}

function mapStyleObject(style: unknown): unknown {
  if (Array.isArray(style)) {
    return style.map(mapStyleObject);
  }

  if (typeof style !== 'object' || style === null) {
    return style;
  }

  const mappedEntries = Object.entries(style).map(([key, value]) => [
    key,
    mapFocusMateStyleValue(key, value),
  ]);

  return Object.fromEntries(mappedEntries);
}

function createThemedStyleProxy<T extends Record<string, unknown>>(styles: T): T {
  return new Proxy(styles, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      if (typeof prop === 'string') {
        return mapStyleObject(value);
      }

      return value;
    },
  });
}

let isStyleSheetThemeInstalled = false;

export function installFocusMateStyleSheetTheme(styleSheet: {
  create: (styles: any) => any;
}) {
  if (isStyleSheetThemeInstalled) return;

  const originalCreate = styleSheet.create.bind(styleSheet);

  styleSheet.create = ((styles: unknown) => {
    const createdStyles = originalCreate(styles);
    return createThemedStyleProxy(createdStyles as Record<string, unknown>);
  }) as typeof styleSheet.create;

  isStyleSheetThemeInstalled = true;
}
