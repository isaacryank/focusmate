import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { theme } from '../../theme';
import { useFocusMateTheme } from '../../theme/FocusMateThemeProvider';

type NoticeType = 'success' | 'info' | 'warning' | 'error';

type NoticeCardProps = {
  type?: NoticeType;
  title: string;
  message: string;
};

function getNoticeConfig(type: NoticeType) {
  if (type === 'success') {
    return {
      color: theme.colors.primaryDark,
      background: theme.colors.successSoft,
      icon: 'checkmark-circle',
    };
  }

  if (type === 'warning') {
    return {
      color: theme.colors.yellow,
      background: theme.colors.yellowSoft,
      icon: 'alert-circle',
    };
  }

  if (type === 'error') {
    return {
      color: theme.colors.danger,
      background: theme.colors.dangerSoft,
      icon: 'close-circle',
    };
  }

  return {
    color: theme.colors.blue,
    background: theme.colors.blueSoft,
    icon: 'information-circle',
  };
}

export default function NoticeCard({
  type = 'info',
  title,
  message,
}: NoticeCardProps) {
  useFocusMateTheme();

  const config = getNoticeConfig(type);

  return (
    <View style={[styles.card, { backgroundColor: config.background }]}>
      <Ionicons name={config.icon as any} size={23} color={config.color} />

      <View style={styles.textArea}>
        <Text style={[styles.title, { color: config.color }]}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.lg,
    padding: 14,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  textArea: {
    flex: 1,
    marginLeft: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: '900',
  },
  message: {
    marginTop: 3,
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
});