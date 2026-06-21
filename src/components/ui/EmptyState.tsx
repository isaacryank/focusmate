import React from 'react';
import {
  Image,
  ImageSourcePropType,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { theme } from '../../theme';
import { useFocusMateTheme } from '../../theme/FocusMateThemeProvider';
import AppButton from './AppButton';

type EmptyStateProps = {
  imageSource: ImageSourcePropType;
  title: string;
  message: string;
  actionLabel?: string;
  onActionPress?: () => void;
};

export default function EmptyState({
  imageSource,
  title,
  message,
  actionLabel,
  onActionPress,
}: EmptyStateProps) {
  useFocusMateTheme();

  return (
    <View style={styles.card}>
      <Image source={imageSource} style={styles.image} resizeMode="contain" />

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>

      {actionLabel && onActionPress ? (
        <View style={styles.actionArea}>
          <AppButton
            title={actionLabel}
            onPress={onActionPress}
            variant="secondary"
            icon={
              <Ionicons
                name="add-circle-outline"
                size={18}
                color={theme.colors.primaryDark}
              />
            }
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  image: {
    width: 118,
    height: 118,
    marginBottom: 8,
  },
  title: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
  },
  message: {
    marginTop: 6,
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'center',
  },
  actionArea: {
    width: '100%',
    marginTop: 16,
  },
});