import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { theme } from '../../theme';
import { useFocusMateTheme } from '../../theme/FocusMateThemeProvider';

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onActionPress?: () => void;
};

export default function SectionHeader({
  title,
  subtitle,
  actionLabel,
  onActionPress,
}: SectionHeaderProps) {
  useFocusMateTheme();

  return (
    <View style={styles.container}>
      <View style={styles.textArea}>
        <Text style={styles.title}>{title}</Text>

        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>

      {actionLabel && onActionPress ? (
        <TouchableOpacity
          activeOpacity={0.8}
          style={styles.actionButton}
          onPress={onActionPress}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
          <Ionicons
            name="chevron-forward"
            size={15}
            color={theme.colors.primaryDark}
          />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  textArea: {
    flex: 1,
    paddingRight: 12,
  },
  title: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: 3,
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionText: {
    color: theme.colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
  },
});