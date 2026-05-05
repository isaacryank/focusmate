import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { theme } from '../../theme';
import { MiloMood, getMiloMoodLabel } from '../../lib/miloPersonality';
import MiloMoodImage from './MiloMoodImage';

type MiloMessageCardProps = {
  mood: MiloMood;
  title: string;
  message: string;
  tagline?: string;
  primaryActionLabel?: string;
  onPrimaryActionPress?: () => void;
  secondaryActionLabel?: string;
  onSecondaryActionPress?: () => void;
  compact?: boolean;
  miloSize?: number;
};

export default function MiloMessageCard({
  mood,
  title,
  message,
  tagline,
  primaryActionLabel,
  onPrimaryActionPress,
  secondaryActionLabel,
  onSecondaryActionPress,
  compact = false,
  miloSize,
}: MiloMessageCardProps) {
  return (
    <LinearGradient
      colors={['#F7FFF9', '#DDF8E7']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, compact && styles.compactCard]}
    >
      <View style={styles.softShape} />

      <View style={styles.textArea}>
        <View style={styles.moodPill}>
          <Ionicons name="sparkles" size={13} color={theme.colors.primaryDark} />
          <Text style={styles.moodText}>{getMiloMoodLabel(mood)} Milo</Text>
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>

        {tagline ? <Text style={styles.tagline}>{tagline}</Text> : null}

        <View style={styles.actionRow}>
          {primaryActionLabel && onPrimaryActionPress ? (
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.primaryButton}
              onPress={onPrimaryActionPress}
              accessibilityRole="button"
              accessibilityLabel={primaryActionLabel}
            >
              <Text style={styles.primaryButtonText}>{primaryActionLabel}</Text>
              <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
            </TouchableOpacity>
          ) : null}

          {secondaryActionLabel && onSecondaryActionPress ? (
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.secondaryButton}
              onPress={onSecondaryActionPress}
              accessibilityRole="button"
              accessibilityLabel={secondaryActionLabel}
            >
              <Text style={styles.secondaryButtonText}>
                {secondaryActionLabel}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <MiloMoodImage
        mood={mood}
        size={miloSize || (compact ? 118 : 150)}
        style={styles.milo}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 210,
    borderRadius: theme.radius.xl,
    padding: 18,
    marginBottom: 18,
    overflow: 'hidden',
    ...theme.shadow,
  },
  compactCard: {
    minHeight: 180,
  },
  softShape: {
    position: 'absolute',
    right: -35,
    bottom: -35,
    width: 210,
    height: 155,
    borderRadius: 90,
    backgroundColor: 'rgba(85, 200, 120, 0.13)',
  },
  textArea: {
    width: '62%',
    zIndex: 3,
  },
  moodPill: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  moodText: {
    marginLeft: 5,
    color: theme.colors.primaryDark,
    fontSize: 11,
    fontWeight: '900',
  },
  title: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  message: {
    marginTop: 7,
    color: theme.colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  tagline: {
    marginTop: 7,
    color: theme.colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
  },
  actionRow: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
    marginBottom: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    marginRight: 7,
  },
  secondaryButton: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },
  secondaryButtonText: {
    color: theme.colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
  },
  milo: {
    position: 'absolute',
    right: 0,
    bottom: -4,
    zIndex: 2,
  },
});
