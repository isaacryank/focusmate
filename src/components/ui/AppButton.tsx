import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { theme } from '../../theme';
import { useFocusMateTheme } from '../../theme/FocusMateThemeProvider';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

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
  useFocusMateTheme();

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

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: theme.radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
    ...theme.shadowSoft,
  },
  secondaryButton: {
    backgroundColor: theme.colors.primarySoft,
  },
  ghostButton: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  dangerButton: {
    backgroundColor: theme.colors.danger,
  },
  disabledButton: {
    opacity: 0.55,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
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