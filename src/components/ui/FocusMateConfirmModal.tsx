import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { theme } from '../../theme';

type FocusMateConfirmModalProps = {
  visible: boolean;
  title: string;
  message: string;
  primaryLabel: string;
  secondaryLabel?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: 'primary' | 'warning' | 'danger' | 'info';
  onPrimary: () => void;
  onSecondary?: () => void;
  onClose: () => void;
};

function getToneColors(tone: FocusMateConfirmModalProps['tone']) {
  if (tone === 'danger') {
    return {
      color: theme.colors.danger,
      backgroundColor: theme.colors.dangerSoft,
      borderColor: '#F3B7B7',
    };
  }

  if (tone === 'warning') {
    return {
      color: '#92400E',
      backgroundColor: theme.colors.warningSoft,
      borderColor: '#FCD34D',
    };
  }

  if (tone === 'info') {
    return {
      color: theme.colors.blue,
      backgroundColor: theme.colors.blueSoft,
      borderColor: theme.colors.inputBorder,
    };
  }

  return {
    color: theme.colors.primaryDark,
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.inputBorder,
  };
}

export default function FocusMateConfirmModal({
  visible,
  title,
  message,
  primaryLabel,
  secondaryLabel = 'Cancel',
  icon = 'sparkles-outline',
  tone = 'primary',
  onPrimary,
  onSecondary,
  onClose,
}: FocusMateConfirmModalProps) {
  const toneColors = getToneColors(tone);

  const handleSecondary = () => {
    if (onSecondary) {
      onSecondary();
      return;
    }

    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          activeOpacity={1}
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close confirmation"
        />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.messageRow}>
            <View
              style={[
                styles.iconBox,
                {
                  backgroundColor: toneColors.backgroundColor,
                  borderColor: toneColors.borderColor,
                },
              ]}
            >
              <Ionicons name={icon} size={23} color={toneColors.color} />
            </View>

            <View style={styles.copy}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.message}>{message}</Text>
            </View>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              activeOpacity={0.84}
              style={styles.secondaryButton}
              onPress={handleSecondary}
              accessibilityRole="button"
              accessibilityLabel={secondaryLabel}
            >
              <Text style={styles.secondaryText}>{secondaryLabel}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.86}
              style={[
                styles.primaryButton,
                tone === 'danger' && styles.primaryButtonDanger,
              ]}
              onPress={onPrimary}
              accessibilityRole="button"
              accessibilityLabel={primaryLabel}
            >
              <Text style={styles.primaryText}>{primaryLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(24, 31, 27, 0.34)',
    padding: 14,
  },
  sheet: {
    backgroundColor: theme.colors.card,
    borderRadius: 26,
    padding: 15,
    borderWidth: 1.2,
    borderBottomWidth: 2,
    borderColor: theme.colors.inputBorder,
    borderTopColor: '#FDF7E978',
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 7,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: theme.colors.border,
    marginBottom: 14,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 20,
    borderWidth: 1.2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 11,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  message: {
    color: theme.colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 5,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 18,
    backgroundColor: theme.colors.surface,
    borderWidth: 1.2,
    borderBottomWidth: 1.8,
    borderColor: theme.colors.inputBorder,
    borderTopColor: '#FDF7E978',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 9,
  },
  secondaryText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  primaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 18,
    backgroundColor: theme.colors.primary,
    borderWidth: 1.2,
    borderBottomWidth: 2,
    borderColor: '#4DBA62',
    borderTopColor: '#7CE38D',
    borderBottomColor: '#1E6C34',
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonDanger: {
    backgroundColor: theme.colors.danger,
    borderColor: '#F87171',
    borderTopColor: '#FCA5A5',
    borderBottomColor: '#B91C1C',
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
});

