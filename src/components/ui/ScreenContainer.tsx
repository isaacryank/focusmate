import React from 'react';
import {
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '../../theme';
import { useFocusMateTheme } from '../../theme/FocusMateThemeProvider';

type ScreenContainerProps = {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  topPadding?: number;
  bottomPadding?: number;
  includeTopInset?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

export default function ScreenContainer({
  children,
  scroll = true,
  padded = true,
  topPadding = 16,
  bottomPadding = 120,
  includeTopInset = true,
  style,
  contentStyle,
}: ScreenContainerProps) {
  const { isDark } = useFocusMateTheme();

  const insets = useSafeAreaInsets();
  const backgroundColors = isDark
    ? (['#07130F', '#0D1D16', '#102820'] as const)
    : (['#F4FBF1', '#EFF8EE', '#F8FCF6'] as const);
  const glowStyle = isDark ? styles.darkGlow : styles.lightGlow;
  const glowAccentStyle = isDark ? styles.darkGlowAccent : styles.lightGlowAccent;
  const glowMiddleStyle = isDark ? styles.darkGlowMiddle : styles.lightGlowMiddle;

  const innerStyle = [
    styles.content,
    padded && styles.padded,
    {
      paddingTop: (includeTopInset ? insets.top : 0) + topPadding,
      paddingBottom: insets.bottom + bottomPadding,
    },
    contentStyle,
  ];

  if (!scroll) {
    return (
      <View style={[styles.screen, style]}>
        <LinearGradient
          pointerEvents="none"
          colors={backgroundColors}
          style={styles.backgroundGradient}
        />
        <View pointerEvents="none" style={[styles.backgroundGlowTop, glowStyle]} />
        <View
          pointerEvents="none"
          style={[styles.backgroundGlowMiddle, glowMiddleStyle]}
        />
        <View
          pointerEvents="none"
          style={[styles.backgroundGlowBottom, glowAccentStyle]}
        />
        <View style={innerStyle}>{children}</View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, style]}>
      <LinearGradient
        pointerEvents="none"
        colors={backgroundColors}
        style={styles.backgroundGradient}
      />
      <View pointerEvents="none" style={[styles.backgroundGlowTop, glowStyle]} />
      <View
        pointerEvents="none"
        style={[styles.backgroundGlowMiddle, glowMiddleStyle]}
      />
      <View
        pointerEvents="none"
        style={[styles.backgroundGlowBottom, glowAccentStyle]}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={innerStyle}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  backgroundGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  backgroundGlowTop: {
    position: 'absolute',
    top: -110,
    right: -90,
    width: 260,
    height: 260,
    borderRadius: 130,
  },
  backgroundGlowBottom: {
    position: 'absolute',
    left: -120,
    bottom: 120,
    width: 240,
    height: 240,
    borderRadius: 120,
  },
  backgroundGlowMiddle: {
    position: 'absolute',
    top: '36%',
    right: -150,
    width: 280,
    height: 280,
    borderRadius: 140,
  },
  lightGlow: {
    backgroundColor: 'rgba(47, 143, 70, 0.1)',
  },
  lightGlowAccent: {
    backgroundColor: 'rgba(213, 245, 217, 0.28)',
  },
  lightGlowMiddle: {
    backgroundColor: 'rgba(191, 216, 192, 0.1)',
  },
  darkGlow: {
    backgroundColor: 'rgba(0, 168, 132, 0.12)',
  },
  darkGlowAccent: {
    backgroundColor: 'rgba(47, 143, 70, 0.1)',
  },
  darkGlowMiddle: {
    backgroundColor: 'rgba(0, 168, 132, 0.06)',
  },
  content: {
    flexGrow: 1,
  },
  padded: {
    paddingHorizontal: 20,
  },
});
