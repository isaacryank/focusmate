import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { theme } from '../../theme';
import { useFocusMateTheme } from '../../theme/FocusMateThemeProvider';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type GradientColors = readonly [string, string, string];

type AppButtonProps = {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
};

export default function AppButton({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
}: AppButtonProps) {
  const { isDark } = useFocusMateTheme();
  const gradientColors = getButtonGradient(variant, isDark);

  const buttonStyle =
    variant === 'primary'
      ? styles.primaryButton
      : variant === 'secondary'
      ? styles.secondaryButton
      : variant === 'danger'
      ? styles.dangerButton
      : styles.ghostButton;

  const textStyle =
    variant === 'primary' || variant === 'danger'
      ? styles.lightText
      : variant === 'secondary'
      ? styles.secondaryText
      : styles.ghostText;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[styles.button, buttonStyle, disabled && styles.disabledButton]}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <LinearGradient
        pointerEvents="none"
        colors={gradientColors}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={styles.buttonGradient}
      />
      <View pointerEvents="none" style={styles.buttonHighlight} />
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <View style={styles.buttonContent}>
          {icon ? <View style={styles.iconArea}>{icon}</View> : null}
          <Text style={[styles.buttonText, textStyle]}>{title}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function getButtonGradient(
  variant: ButtonVariant,
  isDark: boolean
): GradientColors {
  if (variant === 'primary') {
    return isDark
      ? ['#08B991', '#008069', '#005C4B']
      : ['#45C86A', '#2F9B4A', '#237A38'];
  }

  if (variant === 'danger') {
    return isDark
      ? ['#FF8585', '#FF6B6B', '#D94A4A']
      : ['#FF7777', '#DC2626', '#B91C1C'];
  }

  if (variant === 'secondary') {
    return isDark
      ? ['#17473D', '#0B3B32', '#082E28']
      : ['#F6FFF8', '#E7F7EA', '#D9F0DE'];
  }

  return isDark
    ? ['#24343B', '#202C33', '#18242A']
    : ['#FFFFFF', '#F7FBF5', '#EDF7EE'];
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: theme.radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: '#FDF7E978',
    borderBottomColor: 'rgba(35, 107, 53, 0.14)',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 7,
    },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 5,
    overflow: 'hidden',
  },
  buttonGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  buttonHighlight: {
    position: 'absolute',
    top: 1,
    left: 10,
    right: 10,
    height: 1,
    borderRadius: 1,
    backgroundColor: 'rgba(254, 255, 250, 0.34)',
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
    borderColor: '#6AC47B',
  },
  secondaryButton: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.inputBorder,
  },
  ghostButton: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  dangerButton: {
    backgroundColor: theme.colors.danger,
    borderColor: '#FF9A9A',
  },
  disabledButton: {
    opacity: 0.55,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1,
  },
  iconArea: {
    marginRight: 8,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '900',
  },
  lightText: {
    color: '#FFFFFF',
  },
  secondaryText: {
    color: theme.colors.primaryDark,
  },
  ghostText: {
    color: theme.colors.text,
  },
});
