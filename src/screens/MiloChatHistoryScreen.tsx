import React, { useCallback, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import ScreenContainer from '../components/ui/ScreenContainer';
import { theme } from '../theme';
import {
  clearMiloChatSessions,
  deleteMiloChatSession,
  loadMiloChatSessions,
  type MiloChatSession,
} from '../lib/miloChatStorage';

function formatSessionTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleString('en-MY', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function MiloChatHistoryScreen() {
  const navigation = useNavigation<any>();
  const [sessions, setSessions] = useState<MiloChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshSessions = useCallback(async () => {
    setIsLoading(true);
    const nextSessions = await loadMiloChatSessions();
    setSessions(nextSessions);
    setIsLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshSessions();
    }, [refreshSessions])
  );

  const runWithHaptics = async (action: () => Promise<void> | void) => {
    try {
      await Haptics.selectionAsync();
    } catch {
      // History actions should still work when haptics are unavailable.
    }

    await action();
  };

  const handleOpenSession = (session: MiloChatSession) => {
    void runWithHaptics(() => {
      navigation.navigate('MiloChat', { sessionId: session.id });
    });
  };

  const handleDeleteSession = (session: MiloChatSession) => {
    Alert.alert(
      'Delete old chat?',
      `Remove "${session.title}" from local Milo history?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void runWithHaptics(async () => {
              await deleteMiloChatSession(session.id);
              await refreshSessions();
            });
          },
        },
      ]
    );
  };

  const handleClearAll = () => {
    if (!sessions.length) {
      return;
    }

    Alert.alert(
      'Clear all old chats?',
      'This only clears local Milo chat history on this device.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear all',
          style: 'destructive',
          onPress: () => {
            void runWithHaptics(async () => {
              await clearMiloChatSessions();
              await refreshSessions();
            });
          },
        },
      ]
    );
  };

  return (
    <ScreenContainer scroll={false} includeTopInset={false} bottomPadding={48}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>Milo memory</Text>
          <Text style={styles.title}>Old messages</Text>
        </View>

        {sessions.length ? (
          <TouchableOpacity
            activeOpacity={0.84}
            style={styles.clearButton}
            onPress={handleClearAll}
            accessibilityRole="button"
            accessibilityLabel="Clear all old Milo chats"
          >
            <Ionicons name="trash-outline" size={15} color={theme.colors.danger} />
            <Text style={styles.clearButtonText}>Clear</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {isLoading ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Loading Milo chats...</Text>
        </View>
      ) : sessions.length ? (
        <ScrollView
          style={styles.sessionScroll}
          contentContainerStyle={styles.sessionList}
          showsVerticalScrollIndicator={false}
        >
          {sessions.map((session) => (
            <TouchableOpacity
              key={session.id}
              activeOpacity={0.86}
              style={styles.sessionCard}
              onPress={() => handleOpenSession(session)}
              accessibilityRole="button"
              accessibilityLabel={`Open Milo chat: ${session.title}`}
            >
              <View style={styles.sessionIcon}>
                <Ionicons
                  name="chatbubbles-outline"
                  size={20}
                  color={theme.colors.primaryDark}
                />
              </View>

              <View style={styles.sessionCopy}>
                <View style={styles.sessionTitleRow}>
                  <Text numberOfLines={1} style={styles.sessionTitle}>
                    {session.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.sessionTime}>
                    {formatSessionTime(session.updatedAt)}
                  </Text>
                </View>

                <Text numberOfLines={2} style={styles.sessionPreview}>
                  {session.preview}
                </Text>

                <View style={styles.sessionActions}>
                  <View style={styles.openPill}>
                    <Text style={styles.openPillText}>Open</Text>
                    <Ionicons
                      name="arrow-forward"
                      size={13}
                      color={theme.colors.primaryDark}
                    />
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={styles.deleteButton}
                    onPress={(event) => {
                      event.stopPropagation();
                      handleDeleteSession(session);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete Milo chat: ${session.title}`}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={15}
                      color={theme.colors.danger}
                    />
                    <Text style={styles.deleteText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={28}
              color={theme.colors.primaryDark}
            />
          </View>
          <Text style={styles.emptyTitle}>No old Milo chats yet.</Text>
          <Text style={styles.emptyText}>
            Start a conversation with Milo, then tap New Chat to save it here.
          </Text>
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: theme.colors.primaryDark,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 3,
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  clearButton: {
    minHeight: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.dangerSoft,
    borderWidth: 1,
    borderColor: '#FFD5D5',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    gap: 5,
  },
  clearButtonText: {
    color: theme.colors.danger,
    fontSize: 12,
    fontWeight: '900',
  },
  sessionList: {
    gap: 11,
    paddingBottom: 12,
  },
  sessionScroll: {
    flex: 1,
  },
  sessionCard: {
    borderRadius: 20,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: '#E5ECE3',
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 13,
    ...theme.shadowSoft,
  },
  sessionIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  sessionCopy: {
    flex: 1,
    minWidth: 0,
  },
  sessionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sessionTitle: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  sessionTime: {
    color: theme.colors.muted,
    fontSize: 10,
    fontWeight: '800',
  },
  sessionPreview: {
    marginTop: 6,
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  sessionActions: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  openPill: {
    borderRadius: 999,
    backgroundColor: theme.colors.primarySoft,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  openPillText: {
    color: theme.colors.primaryDark,
    fontSize: 11,
    fontWeight: '900',
  },
  deleteButton: {
    minHeight: 30,
    borderRadius: 15,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: '#F3D5D5',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    gap: 5,
  },
  deleteText: {
    color: theme.colors.danger,
    fontSize: 11,
    fontWeight: '900',
  },
  emptyCard: {
    minHeight: 220,
    borderRadius: 24,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: '#E5ECE3',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
    ...theme.shadowSoft,
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 22,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptyText: {
    marginTop: 6,
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
});
