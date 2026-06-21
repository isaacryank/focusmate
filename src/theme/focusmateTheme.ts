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
    background: '#F7FAF2',
    backgroundSoft: '#FBFDF8',
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
    shadow: 'rgba(0, 0, 0, 0.12)',
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
    shadowColor: 'rgba(0, 0, 0, 0.12)',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 5,
  },
  shadowSoft: {
    shadowColor: 'rgba(0, 0, 0, 0.12)',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
};

export const focusmateDarkTheme: FocusMateTheme = {
  ...sharedThemeShape,
  colors: {
    background: '#0B141A',
    backgroundSoft: '#0B141A',
    surface: '#111B21',
    surfaceSoft: '#1F2C27',
    card: '#202C33',
    cardSoft: '#1F2C27',
    text: '#E9EDEF',
    textSoft: '#AEBAC1',
    muted: '#8696A0',
    mutedText: '#AEBAC1',
    subtleText: '#8696A0',
    primary: '#00A884',
    primarySoft: '#0B3B32',
    primaryDark: '#008069',
    border: '#2A3942',
    divider: '#1F2C34',
    input: '#202C33',
    inputBorder: '#2A3942',
    success: '#00A884',
    successSoft: '#0B3B32',
    warning: '#FBBF24',
    warningSoft: '#332A13',
    danger: '#FF6B6B',
    dangerSoft: '#3A2024',
    overlay: 'rgba(0, 0, 0, 0.55)',
    shadow: 'rgba(0, 0, 0, 0.45)',
    white: '#FFFFFF',
    yellow: '#FBBF24',
    yellowSoft: '#332A13',
    blue: '#64B5F6',
    blueSoft: '#112C3D',
    purple: '#B8A7FF',
    purpleSoft: '#261F36',
    incomingBubble: '#202C33',
    outgoingBubble: '#005C4B',
    chatBackground: '#0B141A',
  },
  shadow: {
    shadowColor: 'rgba(0, 0, 0, 0.45)',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 5,
  },
  shadowSoft: {
    shadowColor: 'rgba(0, 0, 0, 0.45)',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 2,
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

  const token = baseColorTokenMap[baseHex];
  if (!token) return hex;

  return alpha ? rgbaWithAlpha(appTheme.colors[token], alpha) : appTheme.colors[token];
}

function mapRgbaColor(styleKey: string, value: string, appTheme: FocusMateTheme) {
  const compact = value.replace(/\s+/g, '').toLowerCase();

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
    if (getCurrentResolvedTheme() === 'dark') {
      const alpha = compact
        .replace('rgba(255,255,255,', '')
        .replace(')', '');
      return `rgba(32, 44, 51, ${alpha})`;
    }
  }

  if (compact.startsWith('rgba(32,44,51,')) {
    if (getCurrentResolvedTheme() === 'light') {
      const alpha = compact
        .replace('rgba(32,44,51,', '')
        .replace(')', '');
      return `rgba(255, 255, 255, ${alpha})`;
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
