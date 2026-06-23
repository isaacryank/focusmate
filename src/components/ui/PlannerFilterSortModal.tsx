import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { theme } from '../../theme';
import {
  plannerTimingSorts,
  sessionTypeFilters,
  plannerTypeFilters,
  type PlannerTimingSort,
  type PlannerTypeFilter,
} from '../../lib/plannerFilters';

type PlannerFilterSortModalProps = {
  visible: boolean;
  title?: string;
  typeFilter: PlannerTypeFilter;
  sortMode: PlannerTimingSort;
  allowSessionSorts?: boolean;
  onTypeFilterChange: (filter: PlannerTypeFilter) => void;
  onSortModeChange: (sortMode: PlannerTimingSort) => void;
  onClose: () => void;
};

const sessionSorts: { value: PlannerTimingSort; label: string }[] = [
  ...plannerTimingSorts,
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
];

export default function PlannerFilterSortModal({
  visible,
  title = 'Filter and sort',
  typeFilter,
  sortMode,
  allowSessionSorts = false,
  onTypeFilterChange,
  onSortModeChange,
  onClose,
}: PlannerFilterSortModalProps) {
  const sorts = allowSessionSorts ? sessionSorts : plannerTimingSorts;
  const filters = allowSessionSorts ? sessionTypeFilters : plannerTypeFilters;

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
          accessibilityLabel="Close filters"
        />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <View style={styles.headerIcon}>
                <Ionicons name="options-outline" size={18} color={theme.colors.primaryDark} />
              </View>
              <Text style={styles.title}>{title}</Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.78}
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={18} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>Type</Text>
          <View style={styles.chipRow}>
            {filters.map((filter) => {
              const active = typeFilter === filter.value;

              return (
                <TouchableOpacity
                  key={filter.value}
                  activeOpacity={0.84}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => onTypeFilterChange(filter.value)}
                  accessibilityRole="button"
                  accessibilityLabel={`Filter ${filter.label}`}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {filter.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sectionLabel}>Sort</Text>
          <View style={styles.chipRow}>
            {sorts.map((sort) => {
              const active = sortMode === sort.value;

              return (
                <TouchableOpacity
                  key={sort.value}
                  activeOpacity={0.84}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => onSortModeChange(sort.value)}
                  accessibilityRole="button"
                  accessibilityLabel={`Sort ${sort.label}`}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {sort.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
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
    backgroundColor: 'rgba(24, 31, 27, 0.32)',
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  titleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 9,
  },
  title: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionLabel: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 8,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginRight: -8,
  },
  chip: {
    minHeight: 34,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderTopColor: '#FDF7E978',
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: '#4DBA62',
    borderTopColor: '#7CE38D',
  },
  chipText: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '900',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
});
