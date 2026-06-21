import React from 'react';
import {
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
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
  useFocusMateTheme();

  const insets = useSafeAreaInsets();

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
        <View style={innerStyle}>{children}</View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, style]}>
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
  content: {
    flexGrow: 1,
  },
  padded: {
    paddingHorizontal: 20,
  },
});
