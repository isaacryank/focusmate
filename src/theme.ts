import { StyleSheet } from 'react-native';

import {
  getCurrentFocusMateTheme,
  installFocusMateStyleSheetTheme,
  type FocusMateTheme,
} from './theme/focusmateTheme';

installFocusMateStyleSheetTheme(StyleSheet);

function createThemeBridge<T extends Record<string, unknown>>(
  readCurrent: () => T
): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      return readCurrent()[prop as keyof T];
    },
  });
}

export const theme = {
  colors: createThemeBridge<FocusMateTheme['colors']>(
    () => getCurrentFocusMateTheme().colors
  ),
  radius: createThemeBridge<FocusMateTheme['radius']>(
    () => getCurrentFocusMateTheme().radius
  ),
  spacing: createThemeBridge<FocusMateTheme['spacing']>(
    () => getCurrentFocusMateTheme().spacing
  ),
  typography: createThemeBridge<FocusMateTheme['typography']>(
    () => getCurrentFocusMateTheme().typography
  ),
  get shadow() {
    return getCurrentFocusMateTheme().shadow;
  },
  get shadowSoft() {
    return getCurrentFocusMateTheme().shadowSoft;
  },
};
