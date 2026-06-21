import React, { useMemo, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

import { theme } from '../theme';
import { useFocusMateTheme } from '../theme/FocusMateThemeProvider';
import {
  dateFromStorage,
  formatDateForStorage,
  formatTimeForStorage,
  timeFromStorage,
} from '../lib/dateTimeUtils';

type PickerMode = 'date' | 'time';

type DateTimePickerButtonProps = {
  label: string;
  mode: PickerMode;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
};

export default function DateTimePickerButton({
  label,
  mode,
  value,
  placeholder,
  onChange,
}: DateTimePickerButtonProps) {
  useFocusMateTheme();

  const [isPickerVisible, setIsPickerVisible] = useState(false);

  const pickerValue = useMemo(() => {
    if (mode === 'date') {
      return dateFromStorage(value);
    }

    return timeFromStorage(value);
  }, [mode, value]);

  const handlePickerChange = (
    event: DateTimePickerEvent,
    selectedDate?: Date
  ) => {
    if (Platform.OS === 'android') {
      setIsPickerVisible(false);
    }

    if (event.type === 'dismissed') {
      return;
    }

    if (!selectedDate) {
      return;
    }

    if (mode === 'date') {
      onChange(formatDateForStorage(selectedDate));
    } else {
      onChange(formatTimeForStorage(selectedDate));
    }
  };

  return (
    <View>
      <Text style={styles.label}>{label}</Text>

      <TouchableOpacity
        activeOpacity={0.85}
        style={styles.pickerButton}
        onPress={() => setIsPickerVisible(true)}
      >
        <Ionicons
          name={mode === 'date' ? 'calendar-outline' : 'time-outline'}
          size={20}
          color={theme.colors.muted}
        />

        <Text style={[styles.pickerText, !value && styles.placeholderText]}>
          {value || placeholder}
        </Text>

        <Ionicons
          name="chevron-down"
          size={18}
          color={theme.colors.muted}
        />
      </TouchableOpacity>

      {value ? (
        <TouchableOpacity
          activeOpacity={0.75}
          style={styles.clearButton}
          onPress={() => onChange('')}
        >
          <Text style={styles.clearText}>
            Clear {mode === 'date' ? 'date' : 'time'}
          </Text>
        </TouchableOpacity>
      ) : null}

      {isPickerVisible && (
        <View style={styles.pickerBox}>
          <DateTimePicker
            value={pickerValue}
            mode={mode}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handlePickerChange}
            is24Hour={false}
          />

          {Platform.OS === 'ios' && (
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.doneButton}
              onPress={() => setIsPickerVisible(false)}
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: '900',
    color: theme.colors.textSoft,
    marginBottom: 8,
  },
  pickerButton: {
    minHeight: 56,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pickerText: {
    flex: 1,
    marginLeft: 9,
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  placeholderText: {
    color: theme.colors.muted,
  },
  clearButton: {
    alignSelf: 'flex-start',
    marginTop: 7,
  },
  clearText: {
    color: theme.colors.danger,
    fontWeight: '800',
    fontSize: 12,
  },
  pickerBox: {
    marginTop: 10,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  doneButton: {
    height: 44,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
});