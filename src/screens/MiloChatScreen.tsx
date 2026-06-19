import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '../theme';
import { useTasks } from '../lib/TaskContext';
import { openLocationInMaps } from '../lib/mapUtils';
import {
  buildMiloBrainReply,
  type MiloBrainAction,
} from '../lib/miloBrain';
import {
  loadOnlineMeetingLinks,
  type OnlineMeetingLink,
} from '../lib/meetingLinkStorage';
import { openMeetingLink } from '../lib/meetingLinkUtils';
import type { Task } from '../types/task';

import MiloMoodImage from '../components/milo/MiloMoodImage';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type MiloTalkRole = 'user' | 'milo';

type MiloTalkMessage = {
  id: string;
  role: MiloTalkRole;
  text: string;
  relatedTask?: Task;
  relatedTaskSummary?: string;
  actions?: MiloBrainAction[];
  createdAt: string;
};

const MILO_TALK_INITIAL_TEXT =
  'Hi, I’m Milo. Ask me what to focus on, what is urgent, or how to prepare for your task.';

const miloTalkSuggestions = [
  'What should I do now?',
  'What is urgent?',
  'Due today?',
  'Help me prepare',
  'Find resources',
];

const talkActionIcons: Record<MiloBrainAction['type'], IconName> = {
  viewTask: 'document-text-outline',
  startFocus: 'timer-outline',
  findResources: 'search-outline',
  openMaps: 'map-outline',
  joinMeeting: 'videocam-outline',
};

function createMiloTalkMessageId(role: MiloTalkRole) {
  return `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function MiloChatScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { tasks } = useTasks();
  const talkScrollRef = useRef<ScrollView | null>(null);
  const mountedRef = useRef(true);

  const [onlineMeetingLinks, setOnlineMeetingLinks] = useState<
    OnlineMeetingLink[]
  >([]);
  const [miloTalkInput, setMiloTalkInput] = useState('');
  const [chatMessages, setChatMessages] = useState<MiloTalkMessage[]>(() => [
    {
      id: 'milo-initial-message',
      role: 'milo',
      text: MILO_TALK_INITIAL_TEXT,
      createdAt: new Date().toISOString(),
    },
  ]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
      title: 'Talk with Milo',
    });
  }, [navigation]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshOnlineMeetingLinks = useCallback(async () => {
    const nextMeetingLinks = await loadOnlineMeetingLinks();

    if (mountedRef.current) {
      setOnlineMeetingLinks(nextMeetingLinks);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshOnlineMeetingLinks();
    }, [refreshOnlineMeetingLinks])
  );

  const scrollTalkToBottom = () => {
    requestAnimationFrame(() => {
      talkScrollRef.current?.scrollToEnd({ animated: true });
    });
  };

  const handleSend = async (message = miloTalkInput) => {
    const prompt = message.trim();

    if (!prompt) {
      return;
    }

    try {
      await Haptics.selectionAsync();
    } catch {
      // Chat should still work when haptics are unavailable.
    }

    if (!mountedRef.current) return;

    const reply = buildMiloBrainReply({
      message: prompt,
      tasks,
      meetingLinks: onlineMeetingLinks,
    });
    const userCreatedAt = new Date();
    const miloCreatedAt = new Date(userCreatedAt.getTime() + 1);
    const userMessage: MiloTalkMessage = {
      id: createMiloTalkMessageId('user'),
      role: 'user',
      text: prompt,
      createdAt: userCreatedAt.toISOString(),
    };
    const miloMessage: MiloTalkMessage = {
      id: createMiloTalkMessageId('milo'),
      role: 'milo',
      text: reply.text,
      relatedTask: reply.relatedTask,
      relatedTaskSummary: reply.relatedTaskSummary,
      actions: reply.actions,
      createdAt: miloCreatedAt.toISOString(),
    };

    setChatMessages((currentMessages) => [
      ...currentMessages,
      userMessage,
      miloMessage,
    ]);
    setMiloTalkInput('');
    scrollTalkToBottom();
  };

  const handleOpenResourceFinder = (task?: Task) => {
    navigation.navigate('MainTabs', {
      screen: 'Companion',
      params: {
        openResourceFinder: true,
        openResourceFinderForTaskId: task?.id,
      },
    });
  };

  const handleTalkActionPress = async (
    action: MiloBrainAction,
    fallbackTask?: Task
  ) => {
    const actionTask =
      tasks.find((task) => task.id === action.taskId) ||
      fallbackTask;

    if (action.type === 'viewTask' && actionTask) {
      navigation.navigate('TaskDetails', { taskId: actionTask.id });
      return;
    }

    if (action.type === 'startFocus') {
      if (actionTask) {
        navigation.navigate('FocusSession', { taskId: actionTask.id });
        return;
      }

      navigation.navigate('FocusSession');
      return;
    }

    if (action.type === 'findResources') {
      handleOpenResourceFinder(actionTask);
      return;
    }

    if (action.type === 'openMaps') {
      const location = action.location || actionTask?.location?.trim();

      if (location) {
        await openLocationInMaps(location);
      }

      return;
    }

    if (action.type === 'joinMeeting') {
      const meetingUrl =
        action.meetingUrl ||
        onlineMeetingLinks.find((meetingLink) => meetingLink.taskId === actionTask?.id)
          ?.url;

      if (meetingUrl) {
        await openMeetingLink(meetingUrl);
      }
    }
  };

  const renderTalkActionButton = (
    action: MiloBrainAction,
    index: number,
    relatedTask?: Task
  ) => {
    const isPrimaryAction =
      index === 0 &&
      ['startFocus', 'findResources', 'openMaps', 'joinMeeting'].includes(
        action.type
      );

    return (
      <TouchableOpacity
        key={`${action.type}-${action.taskId || 'general'}`}
        activeOpacity={0.84}
        style={[
          styles.miloTalkActionButton,
          isPrimaryAction
            ? styles.miloTalkActionPrimary
            : styles.miloTalkActionSecondary,
        ]}
        onPress={() => void handleTalkActionPress(action, relatedTask)}
        accessibilityRole="button"
        accessibilityLabel={action.label}
      >
        <Ionicons
          name={talkActionIcons[action.type]}
          size={16}
          color={
            isPrimaryAction ? theme.colors.white : theme.colors.primaryDark
          }
        />
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.78}
          style={[
            styles.miloTalkActionText,
            isPrimaryAction
              ? styles.miloTalkActionPrimaryText
              : styles.miloTalkActionSecondaryText,
          ]}
        >
          {action.label}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderTalkMessage = (message: MiloTalkMessage) => {
    if (message.role === 'user') {
      return (
        <View key={message.id} style={styles.miloTalkMessageRowUser}>
          <View style={styles.miloTalkUserBubble}>
            <Text style={styles.miloTalkUserText}>{message.text}</Text>
          </View>
        </View>
      );
    }

    return (
      <View key={message.id} style={styles.miloTalkMessageRowMilo}>
        <View style={styles.miloTalkMessageAvatar}>
          <MiloMoodImage mood="waving" size={34} />
        </View>
        <View style={styles.miloTalkMiloColumn}>
          <Text style={styles.miloTalkMiloName}>Milo</Text>
          <View style={styles.miloTalkMiloBubble}>
            <Text style={styles.miloTalkMiloText}>{message.text}</Text>

            {message.relatedTask ? (
              <View style={styles.miloTalkTaskCard}>
                <View style={styles.miloTalkTaskIcon}>
                  <Ionicons
                    name={
                      message.relatedTask.plannerType === 'meeting'
                        ? 'people-outline'
                        : message.relatedTask.plannerType === 'date'
                        ? 'heart-outline'
                        : 'checkbox-outline'
                    }
                    size={16}
                    color={theme.colors.primaryDark}
                  />
                </View>
                <View style={styles.miloTalkTaskCopy}>
                  <Text numberOfLines={1} style={styles.miloTalkTaskTitle}>
                    {message.relatedTask.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.miloTalkTaskMeta}>
                    {message.relatedTaskSummary}
                  </Text>
                </View>
              </View>
            ) : null}

            {message.actions?.length ? (
              <View style={styles.miloTalkActionGrid}>
                {message.actions.map((action, index) =>
                  renderTalkActionButton(action, index, message.relatedTask)
                )}
              </View>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
      style={styles.screen}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          activeOpacity={0.82}
          style={styles.headerButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>

        <View style={styles.headerCopy}>
          <Text numberOfLines={1} style={styles.headerTitle}>
            Talk with Milo
          </Text>
          <Text numberOfLines={1} style={styles.headerSubtitle}>
            Your task-aware study buddy
          </Text>
        </View>

        <View style={styles.headerButtonSpacer} />
      </View>

      <ScrollView
        ref={talkScrollRef}
        style={styles.miloTalkMessageList}
        contentContainerStyle={styles.miloTalkMessageListContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onContentSizeChange={scrollTalkToBottom}
      >
        {chatMessages.map(renderTalkMessage)}
      </ScrollView>

      <View
        style={[
          styles.miloTalkComposer,
          { paddingBottom: Math.max(insets.bottom, 10) + 10 },
        ]}
      >
        <View style={styles.miloTalkSuggestionRow}>
          {miloTalkSuggestions.map((suggestion) => (
            <TouchableOpacity
              key={suggestion}
              activeOpacity={0.82}
              style={styles.miloTalkSuggestionChip}
              onPress={() => void handleSend(suggestion)}
              accessibilityRole="button"
              accessibilityLabel={`Send suggestion: ${suggestion}`}
            >
              <Text numberOfLines={1} style={styles.miloTalkSuggestionText}>
                {suggestion}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.miloTalkInputRow}>
          <TextInput
            value={miloTalkInput}
            onChangeText={setMiloTalkInput}
            placeholder="Message Milo..."
            placeholderTextColor={theme.colors.muted}
            returnKeyType="send"
            onSubmitEditing={() => void handleSend()}
            style={styles.miloTalkInput}
          />
          <TouchableOpacity
            activeOpacity={0.84}
            disabled={!miloTalkInput.trim()}
            style={[
              styles.miloTalkSendButton,
              !miloTalkInput.trim() && styles.miloTalkSendButtonDisabled,
            ]}
            onPress={() => void handleSend()}
            accessibilityRole="button"
            accessibilityLabel="Send message to Milo"
          >
            <Ionicons name="send" size={17} color={theme.colors.white} />
          </TouchableOpacity>
        </View>

        <Text style={styles.miloTalkPrototypeFooter}>
          Local prototype: replies use saved task data on this device.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FAFCF7',
  },
  header: {
    minHeight: 76,
    backgroundColor: '#FFFDF7',
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1EA',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonSpacer: {
    width: 42,
    height: 42,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '900',
  },
  headerSubtitle: {
    marginTop: 2,
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
  },
  miloTalkMessageList: {
    flex: 1,
    minHeight: 0,
  },
  miloTalkMessageListContent: {
    paddingHorizontal: 14,
    paddingTop: 20,
    paddingBottom: 28,
  },
  miloTalkMessageRowUser: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 13,
  },
  miloTalkUserBubble: {
    maxWidth: '84%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 8,
    backgroundColor: theme.colors.primaryDark,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  miloTalkUserText: {
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  miloTalkMessageRowMilo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 13,
    paddingRight: 18,
  },
  miloTalkMessageAvatar: {
    width: 40,
    height: 40,
    borderRadius: 15,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    overflow: 'hidden',
    flexShrink: 0,
  },
  miloTalkMiloColumn: {
    flex: 1,
    minWidth: 0,
  },
  miloTalkMiloName: {
    color: theme.colors.primaryDark,
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 4,
    marginLeft: 3,
  },
  miloTalkMiloBubble: {
    maxWidth: '100%',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: '#E5ECE3',
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  miloTalkMiloText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  miloTalkTaskCard: {
    marginTop: 12,
    borderRadius: 18,
    backgroundColor: '#F7FBF6',
    borderWidth: 1,
    borderColor: '#E6EEE3',
    paddingHorizontal: 11,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  miloTalkTaskIcon: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    flexShrink: 0,
  },
  miloTalkTaskCopy: {
    flex: 1,
    minWidth: 0,
  },
  miloTalkTaskTitle: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '900',
  },
  miloTalkTaskMeta: {
    marginTop: 4,
    color: theme.colors.textSoft,
    fontSize: 10,
    fontWeight: '800',
  },
  miloTalkComposer: {
    borderTopWidth: 1,
    borderTopColor: '#EEF1EA',
    backgroundColor: '#FFFDF7',
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  miloTalkSuggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  miloTalkSuggestionChip: {
    maxWidth: '100%',
    borderRadius: 999,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: '#DBE7DB',
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  miloTalkSuggestionText: {
    color: theme.colors.primaryDark,
    fontSize: 11,
    fontWeight: '900',
  },
  miloTalkInputRow: {
    marginTop: 10,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  miloTalkInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    borderRadius: 22,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: '#DBE7DB',
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  miloTalkSendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.primaryDark,
    shadowOffset: {
      width: 0,
      height: 7,
    },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 3,
  },
  miloTalkSendButtonDisabled: {
    backgroundColor: '#BFD4C4',
    shadowOpacity: 0,
    elevation: 0,
  },
  miloTalkPrototypeFooter: {
    marginTop: 8,
    color: theme.colors.muted,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 13,
    textAlign: 'center',
  },
  miloTalkActionGrid: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  miloTalkActionButton: {
    flexGrow: 1,
    flexBasis: '45%',
    minWidth: 118,
    minHeight: 38,
    borderRadius: 19,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
    gap: 6,
  },
  miloTalkActionPrimary: {
    backgroundColor: theme.colors.primaryDark,
  },
  miloTalkActionSecondary: {
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: '#DBE7DB',
  },
  miloTalkActionText: {
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
    minWidth: 0,
  },
  miloTalkActionPrimaryText: {
    color: theme.colors.white,
  },
  miloTalkActionSecondaryText: {
    color: theme.colors.primaryDark,
  },
});
