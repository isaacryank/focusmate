import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import ScreenContainer from '../components/ui/ScreenContainer';
import AppButton from '../components/ui/AppButton';
import { theme } from '../theme';
import { useAuth } from '../lib/AuthContext';
import { useFocus } from '../lib/FocusContext';
import { useTasks } from '../lib/TaskContext';
import { supabase } from '../lib/supabase';
import {
  clearCurrentMiloChat,
  clearMiloChatSessions,
} from '../lib/miloChatStorage';
import {
  clearFocusSessionHistory,
  getFocusSessionHistory,
  type FocusSessionHistoryItem,
} from '../lib/focusSessionHistory';
import {
  DEFAULT_MILO_AI_SETTINGS,
  loadMiloAiSettings,
  resetMiloAiSettings,
  updateMiloAiSettings,
  type MiloAiMode,
  type MiloAiSettings,
} from '../lib/miloAiSettings';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

type SettingsModal =
  | 'account'
  | 'editProfile'
  | 'emailInfo'
  | 'verify'
  | 'privacy'
  | 'digitalWellbeing'
  | 'notifications'
  | 'inAppNotifications'
  | 'pushSchedule'
  | 'sound'
  | 'appearance'
  | 'language'
  | 'accessibility'
  | 'location'
  | 'guide'
  | 'feedback'
  | 'about'
  | 'bluetooth'
  | 'devices'
  | null;

type AppearancePreference = 'system' | 'light' | 'dark';
type LanguagePreference = 'english' | 'ms';
type TextSizePreference = 'comfortable' | 'large';

type DialogTone = 'info' | 'confirm' | 'danger';

type LocalProfile = {
  displayName: string;
  username: string;
  gender: string;
  birthday: string;
};

type LocalPreferences = {
  appearance: AppearancePreference;
  language: LanguagePreference;
  textSize: TextSizePreference;
  reducedMotion: boolean;
  clearContrast: boolean;
};

type SettingsDialog = {
  title: string;
  message: string;
  icon: IoniconName;
  tone: DialogTone;
  primaryLabel: string;
  secondaryLabel?: string;
  onPrimaryPress?: () => void | Promise<void>;
  onSecondaryPress?: () => void;
};

const miloAvatarImage = require('../../assets/mascot/milo_avatar.png');

const APP_VERSION = '1.0.0';
const LOCAL_PROFILE_STORAGE_KEY = '@focusmate/settings/local-profile';
const LOCAL_PREFERENCES_STORAGE_KEY = '@focusmate/settings/preferences';

const DEFAULT_LOCAL_PROFILE: LocalProfile = {
  displayName: '',
  username: '',
  gender: '',
  birthday: '',
};

const DEFAULT_LOCAL_PREFERENCES: LocalPreferences = {
  appearance: 'system',
  language: 'english',
  textSize: 'comfortable',
  reducedMotion: false,
  clearContrast: true,
};

const mainGreen = theme.colors.primaryDark;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getCleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeLocalProfile(value: unknown): LocalProfile {
  if (!isRecord(value)) {
    return DEFAULT_LOCAL_PROFILE;
  }

  return {
    displayName: getCleanText(value.displayName),
    username: getCleanText(value.username),
    gender: getCleanText(value.gender),
    birthday: getCleanText(value.birthday),
  };
}

function sanitizePreferences(value: unknown): LocalPreferences {
  if (!isRecord(value)) {
    return DEFAULT_LOCAL_PREFERENCES;
  }

  const appearance = value.appearance;
  const language = value.language;
  const textSize = value.textSize;

  return {
    appearance:
      appearance === 'light' || appearance === 'dark' || appearance === 'system'
        ? appearance
        : DEFAULT_LOCAL_PREFERENCES.appearance,
    language: language === 'ms' || language === 'english' ? language : 'english',
    textSize:
      textSize === 'large' || textSize === 'comfortable'
        ? textSize
        : DEFAULT_LOCAL_PREFERENCES.textSize,
    reducedMotion:
      typeof value.reducedMotion === 'boolean'
        ? value.reducedMotion
        : DEFAULT_LOCAL_PREFERENCES.reducedMotion,
    clearContrast:
      typeof value.clearContrast === 'boolean'
        ? value.clearContrast
        : DEFAULT_LOCAL_PREFERENCES.clearContrast,
  };
}

async function loadStoredJson<T>(
  storageKey: string,
  sanitize: (value: unknown) => T
) {
  try {
    const stored = await AsyncStorage.getItem(storageKey);
    return sanitize(stored ? JSON.parse(stored) : null);
  } catch (error) {
    console.log(`Failed to load ${storageKey}:`, error);
    return sanitize(null);
  }
}

async function saveLocalProfile(profile: LocalProfile) {
  await AsyncStorage.setItem(
    LOCAL_PROFILE_STORAGE_KEY,
    JSON.stringify(profile)
  );
}

async function saveLocalPreferences(preferences: LocalPreferences) {
  await AsyncStorage.setItem(
    LOCAL_PREFERENCES_STORAGE_KEY,
    JSON.stringify(preferences)
  );
}

function getAppearanceLabel(value: AppearancePreference) {
  if (value === 'light') return 'Light';
  if (value === 'dark') return 'Dark';
  return 'System';
}

function getLanguageLabel(value: LanguagePreference) {
  return value === 'ms' ? 'Bahasa Melayu' : 'English';
}

function getTextSizeLabel(value: TextSizePreference) {
  return value === 'large' ? 'Large' : 'Comfortable';
}

function formatMinutes(minutes: number) {
  if (minutes <= 0) return '0 min';
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours} hr ${remaining} min` : `${hours} hr`;
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function CircleIcon({
  icon,
  color,
  backgroundColor,
}: {
  icon: IoniconName;
  color: string;
  backgroundColor: string;
}) {
  return (
    <View style={[styles.circleIcon, { backgroundColor }]}>
      <Ionicons name={icon} size={18} color={color} />
    </View>
  );
}

function SettingsRow({
  title,
  subtitle,
  value,
  icon,
  iconColor,
  iconBackground,
  onPress,
  danger,
}: {
  title: string;
  subtitle?: string;
  value?: string;
  icon: IoniconName;
  iconColor: string;
  iconBackground: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.82}
      style={styles.settingsRow}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <CircleIcon
        icon={icon}
        color={danger ? theme.colors.danger : iconColor}
        backgroundColor={danger ? theme.colors.dangerSoft : iconBackground}
      />

      <View style={styles.rowTextArea}>
        <Text
          numberOfLines={1}
          style={[styles.rowTitle, danger && styles.dangerText]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={styles.rowSubtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {value ? (
        <Text numberOfLines={1} style={styles.rowValue}>
          {value}
        </Text>
      ) : null}

      <Ionicons name="chevron-forward" size={17} color={theme.colors.muted} />
    </TouchableOpacity>
  );
}

function ModalSheet({
  visible,
  title,
  subtitle,
  children,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalKeyboardArea}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />

            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.modalTitle}>{title}</Text>
                {subtitle ? (
                  <Text style={styles.modalSubtitle}>{subtitle}</Text>
                ) : null}
              </View>

              <TouchableOpacity
                activeOpacity={0.82}
                style={styles.modalCloseButton}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={`Close ${title}`}
              >
                <Ionicons name="close" size={20} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.modalContent}
            >
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function InfoText({ children }: { children: React.ReactNode }) {
  return <Text style={styles.infoText}>{children}</Text>;
}

function BulletLine({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bulletLine}>
      <View style={styles.bulletDot} />
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

function OptionButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.84}
      style={[styles.optionButton, selected && styles.optionButtonSelected]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text
        style={[
          styles.optionButtonText,
          selected && styles.optionButtonTextSelected,
        ]}
      >
        {label}
      </Text>
      {selected ? (
        <Ionicons name="checkmark-circle" size={18} color={mainGreen} />
      ) : (
        <Ionicons name="ellipse-outline" size={18} color={theme.colors.muted} />
      )}
    </TouchableOpacity>
  );
}

function ModalActionRow({
  title,
  subtitle,
  icon,
  iconColor,
  iconBackground,
  onPress,
}: {
  title: string;
  subtitle?: string;
  icon: IoniconName;
  iconColor: string;
  iconBackground: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.84}
      style={styles.modalActionRow}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <CircleIcon icon={icon} color={iconColor} backgroundColor={iconBackground} />

      <View style={styles.modalActionCopy}>
        <Text numberOfLines={1} style={styles.modalActionTitle}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={2} style={styles.modalActionSubtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <Ionicons name="chevron-forward" size={17} color={theme.colors.muted} />
    </TouchableOpacity>
  );
}

function InfoPanel({
  icon,
  title,
  message,
}: {
  icon: IoniconName;
  title: string;
  message: string;
}) {
  return (
    <View style={styles.infoPanel}>
      <CircleIcon icon={icon} color={mainGreen} backgroundColor={theme.colors.primarySoft} />
      <View style={styles.infoPanelCopy}>
        <Text style={styles.infoPanelTitle}>{title}</Text>
        <Text style={styles.infoPanelMessage}>{message}</Text>
      </View>
    </View>
  );
}

function SettingsDialogModal({
  dialog,
  onClose,
}: {
  dialog: SettingsDialog | null;
  onClose: () => void;
}) {
  if (!dialog) return null;

  const isDanger = dialog.tone === 'danger';
  const iconColor = isDanger ? theme.colors.danger : mainGreen;
  const iconBackground = isDanger ? theme.colors.dangerSoft : theme.colors.primarySoft;

  const handlePrimaryPress = () => {
    const action = dialog.onPrimaryPress;
    onClose();
    void action?.();
  };

  const handleSecondaryPress = () => {
    const action = dialog.onSecondaryPress;
    onClose();
    action?.();
  };

  return (
    <Modal
      visible
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.dialogRoot}>
        <Pressable style={styles.dialogBackdrop} onPress={onClose} />

        <View style={styles.dialogCard}>
          <View style={[styles.dialogIconBubble, { backgroundColor: iconBackground }]}>
            <Ionicons name={dialog.icon} size={24} color={iconColor} />
          </View>

          <Text style={styles.dialogTitle}>{dialog.title}</Text>
          <Text style={styles.dialogMessage}>{dialog.message}</Text>

          <View style={styles.dialogActions}>
            {dialog.secondaryLabel ? (
              <AppButton
                title={dialog.secondaryLabel}
                variant="ghost"
                onPress={handleSecondaryPress}
              />
            ) : null}
            <AppButton
              title={dialog.primaryLabel}
              variant={isDanger ? 'danger' : 'primary'}
              onPress={handlePrimaryPress}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.statPillValue}>{value}</Text>
      <Text style={styles.statPillLabel}>{label}</Text>
    </View>
  );
}

export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  const { userName, user, signOut } = useAuth();
  const { tasks, clearAllTasks } = useTasks();
  const { focusSessions, totalFocusMinutes, clearFocusSessions } = useFocus();

  const [activeModal, setActiveModal] = useState<SettingsModal>(null);
  const [dialog, setDialog] = useState<SettingsDialog | null>(null);
  const [localProfile, setLocalProfile] = useState<LocalProfile>(
    DEFAULT_LOCAL_PROFILE
  );
  const [profileDraft, setProfileDraft] = useState<LocalProfile>(
    DEFAULT_LOCAL_PROFILE
  );
  const [localPreferences, setLocalPreferences] = useState<LocalPreferences>(
    DEFAULT_LOCAL_PREFERENCES
  );
  const [miloAiSettings, setMiloAiSettings] = useState<MiloAiSettings>(
    DEFAULT_MILO_AI_SETTINGS
  );
  const [focusHistory, setFocusHistory] = useState<FocusSessionHistoryItem[]>(
    []
  );
  const [isMiloAiSettingsVisible, setIsMiloAiSettingsVisible] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const loadSettingsData = async () => {
        const [storedProfile, storedPreferences, storedAiSettings, history] =
          await Promise.all([
            loadStoredJson(LOCAL_PROFILE_STORAGE_KEY, sanitizeLocalProfile),
            loadStoredJson(LOCAL_PREFERENCES_STORAGE_KEY, sanitizePreferences),
            loadMiloAiSettings(),
            getFocusSessionHistory(),
          ]);

        if (!isActive) return;

        setLocalProfile(storedProfile);
        setLocalPreferences(storedPreferences);
        setMiloAiSettings(storedAiSettings);
        setFocusHistory(history);
      };

      void loadSettingsData();

      return () => {
        isActive = false;
      };
    }, [])
  );

  const authDisplayName = userName.trim() || 'Student';
  const displayName = localProfile.displayName || authDisplayName;
  const accountEmail = user?.email?.trim() || '';
  const accountSubtitle = localProfile.username
    ? `@${localProfile.username}`
    : accountEmail || 'Profile, security and privacy';
  const aiModeLabel =
    miloAiSettings.aiMode === 'online' ? 'AI Online' : 'Local Only';

  const plannerSummary = useMemo(() => {
    const pending = tasks.filter((task) => task.status === 'pending').length;
    const completed = tasks.filter((task) => task.status === 'completed').length;
    const reminders = tasks.filter(
      (task) => task.reminder && task.reminder !== 'none'
    ).length;
    const meetings = tasks.filter((task) => task.plannerType === 'meeting')
      .length;

    return {
      pending,
      completed,
      reminders,
      meetings,
    };
  }, [tasks]);

  const wellbeingSummary = useMemo(() => {
    const completedHistory = focusHistory.filter(
      (session) => session.status === 'completed'
    );
    const richerFocusMinutes = focusHistory.reduce(
      (total, session) => total + session.durationMinutes,
      0
    );
    const wellbeingMinutes = focusHistory.length
      ? richerFocusMinutes
      : totalFocusMinutes;
    const sessionCount = focusHistory.length || focusSessions.length;
    const cleanSessions = focusHistory.filter(
      (session) => session.focusQuality === 'clean'
    ).length;

    return {
      minutes: wellbeingMinutes,
      sessions: sessionCount,
      completedSessions: completedHistory.length || focusSessions.length,
      cleanSessions,
    };
  }, [focusHistory, focusSessions.length, totalFocusMinutes]);

  const openComingSoon = (modal: Exclude<SettingsModal, null>) => {
    setActiveModal(modal);
  };

  const showDialog = (nextDialog: SettingsDialog) => {
    setDialog(nextDialog);
  };

  const handleOpenEditProfile = () => {
    setProfileDraft({
      ...localProfile,
      displayName: displayName,
    });
    setActiveModal('editProfile');
  };

  const updateProfileDraft = (partial: Partial<LocalProfile>) => {
    setProfileDraft((current) => ({
      ...current,
      ...partial,
    }));
  };

  const handleSaveProfileDraft = async () => {
    const nextProfile: LocalProfile = {
      displayName: profileDraft.displayName.trim() || authDisplayName,
      username: profileDraft.username.trim(),
      gender: profileDraft.gender.trim(),
      birthday: profileDraft.birthday.trim(),
    };

    if (nextProfile.birthday && !/^\d{4}-\d{2}-\d{2}$/.test(nextProfile.birthday)) {
      showDialog({
        title: 'Check birthday format',
        message: 'Please save birthday as YYYY-MM-DD for now.',
        icon: 'calendar',
        tone: 'info',
        primaryLabel: 'Got it',
      });
      return;
    }

    setLocalProfile(nextProfile);
    await saveLocalProfile(nextProfile);
    setActiveModal(null);
  };

  const handleSavePreferences = async (partial: Partial<LocalPreferences>) => {
    const nextPreferences = {
      ...localPreferences,
      ...partial,
    };

    setLocalPreferences(nextPreferences);
    await saveLocalPreferences(nextPreferences);
  };

  const handleSelectAppearance = async (appearance: AppearancePreference) => {
    await handleSavePreferences({ appearance });
    setActiveModal(null);
  };

  const handleSelectLanguage = async (language: LanguagePreference) => {
    await handleSavePreferences({ language });
    setActiveModal(null);
  };

  const handleUpdateMiloAiSettings = async (
    partial: Partial<MiloAiSettings>
  ) => {
    const nextSettings = await updateMiloAiSettings(partial);
    setMiloAiSettings(nextSettings);
  };

  const handleSetAiMode = async (aiMode: MiloAiMode) => {
    await handleUpdateMiloAiSettings({ aiMode });
  };

  const handleResetMiloAiSettings = () => {
    showDialog({
      title: 'Reset Milo AI settings?',
      message:
        'This returns Milo Brain to AI Online mode, skips AI for small talk, hides debug reasons, and refreshes the call count for today.',
      icon: 'refresh',
      tone: 'confirm',
      primaryLabel: 'Reset',
      secondaryLabel: 'Cancel',
      onPrimaryPress: async () => {
        const nextSettings = await resetMiloAiSettings();
        setMiloAiSettings(nextSettings);
      },
    });
  };

  const handlePasswordReset = () => {
    if (!accountEmail) {
      showDialog({
        title: 'Email account needed',
        message:
          'Password reset is available after signing in with a Supabase email account.',
        icon: 'mail',
        tone: 'info',
        primaryLabel: 'Got it',
      });
      return;
    }

    showDialog({
      title: 'Send password reset?',
      message: `Milo will ask Supabase to send a password reset email to ${accountEmail}.`,
      icon: 'key',
      tone: 'confirm',
      primaryLabel: 'Send',
      secondaryLabel: 'Cancel',
      onPrimaryPress: async () => {
        const { error } = await supabase.auth.resetPasswordForEmail(accountEmail);

        if (error) {
          showDialog({
            title: 'Could not send reset email',
            message: error.message || 'Please try again in a moment.',
            icon: 'alert-circle',
            tone: 'info',
            primaryLabel: 'Got it',
          });
          return;
        }

        showDialog({
          title: 'Password reset requested',
          message: `A password reset link was requested for ${accountEmail}. Follow the email link to continue securely.`,
          icon: 'key',
          tone: 'info',
          primaryLabel: 'Done',
        });
      },
    });
  };

  const handleOpenFeedbackEmail = async () => {
    const url =
      'mailto:?subject=FocusMate%20feedback&body=Hi%20Isaac%2C%0A%0AI%20want%20to%20share%20feedback%20about%20FocusMate%3A%0A';

    try {
      const canOpen = await Linking.canOpenURL(url);

      if (!canOpen) {
        showDialog({
          title: 'Email app not found',
          message: 'You can still collect feedback in your FYP notes for now.',
          icon: 'mail',
          tone: 'info',
          primaryLabel: 'Got it',
        });
        return;
      }

      await Linking.openURL(url);
    } catch (error) {
      showDialog({
        title: 'Could not open email',
        message:
          'The feedback placeholder is ready, but the email app did not open.',
        icon: 'mail',
        tone: 'info',
        primaryLabel: 'Got it',
      });
    }
  };

  const handleSignOut = () => {
    showDialog({
      title: 'Sign out?',
      message: 'You can sign in again when you return.',
      icon: 'log-out-outline',
      tone: 'danger',
      primaryLabel: 'Sign out',
      secondaryLabel: 'Cancel',
      onPrimaryPress: async () => {
        try {
          await signOut();
        } catch (error) {
          showDialog({
            title: 'Could not sign out',
            message: error instanceof Error ? error.message : 'Please try again.',
            icon: 'alert-circle',
            tone: 'info',
            primaryLabel: 'Got it',
          });
        }
      },
    });
  };

  const handleStartFresh = () => {
    showDialog({
      title: 'Reset local FocusMate data?',
      message:
        'This clears local planner cache, focus history, Milo chat history, Milo AI preferences, and settings preferences on this device. Your Supabase account and remote user data are not deleted.',
      icon: 'refresh-circle',
      tone: 'danger',
      primaryLabel: 'Reset local data',
      secondaryLabel: 'Cancel',
      onPrimaryPress: async () => {
        setIsResetting(true);

        try {
          await clearAllTasks();
          await clearFocusSessions();
          await clearFocusSessionHistory();
          await clearCurrentMiloChat();
          await clearMiloChatSessions();
          const nextAiSettings = await resetMiloAiSettings();
          await AsyncStorage.removeItem(LOCAL_PROFILE_STORAGE_KEY);
          await AsyncStorage.removeItem(LOCAL_PREFERENCES_STORAGE_KEY);

          setLocalProfile(DEFAULT_LOCAL_PROFILE);
          setProfileDraft(DEFAULT_LOCAL_PROFILE);
          setLocalPreferences(DEFAULT_LOCAL_PREFERENCES);
          setMiloAiSettings(nextAiSettings);
          setFocusHistory([]);
          showDialog({
            title: 'Local reset complete',
            message: 'FocusMate cleared local demo data and kept your account safe.',
            icon: 'checkmark-circle',
            tone: 'info',
            primaryLabel: 'Done',
          });
        } catch (error) {
          showDialog({
            title: 'Reset incomplete',
            message:
              'FocusMate could not clear everything locally. Please try again.',
            icon: 'alert-circle',
            tone: 'info',
            primaryLabel: 'Got it',
          });
        } finally {
          setIsResetting(false);
        }
      },
    });
  };

  return (
    <ScreenContainer
      topPadding={18}
      bottomPadding={150}
      style={styles.screen}
      contentStyle={styles.screenContent}
    >
      <Text style={styles.screenTitle}>Settings</Text>

      <TouchableOpacity
        activeOpacity={0.86}
        style={styles.profileCard}
        onPress={() => setActiveModal('account')}
        accessibilityRole="button"
        accessibilityLabel="Open Account and Security"
      >
        <View style={styles.profileCopy}>
          <Text numberOfLines={1} style={styles.profileName}>
            {displayName}
          </Text>
          <Text numberOfLines={1} style={styles.profileSubtitle}>
            {accountSubtitle}
          </Text>
        </View>

        <View style={styles.avatarRing}>
          <Image source={miloAvatarImage} style={styles.avatarImage} />
        </View>

        <Ionicons name="chevron-forward" size={19} color={theme.colors.muted} />
      </TouchableOpacity>

      <SectionCard title="Connections">
        <SettingsRow
          title="Bluetooth"
          icon="bluetooth"
          iconColor="#1683F3"
          iconBackground="#E7F2FF"
          onPress={() => openComingSoon('bluetooth')}
        />
        <SettingsRow
          title="Connected devices"
          icon="hardware-chip-outline"
          iconColor="#18A957"
          iconBackground="#E9F9EF"
          onPress={() => openComingSoon('devices')}
        />
      </SectionCard>

      <SectionCard title="Milo AI">
        <SettingsRow
          title="AI Online / Local Only"
          value={aiModeLabel}
          icon="sync-circle"
          iconColor="#10A6A6"
          iconBackground="#E7FAFA"
          onPress={() => setIsMiloAiSettingsVisible(true)}
        />
        <SettingsRow
          title="Old messages"
          icon="chatbubbles"
          iconColor="#6FCF97"
          iconBackground="#ECFBF2"
          onPress={() => navigation.navigate('MiloChatHistory')}
        />
      </SectionCard>

      <SectionCard title="Focus & Productivity">
        <SettingsRow
          title="Focus Mode"
          icon="radio-button-on"
          iconColor="#14B84A"
          iconBackground="#E9F9EF"
          onPress={() => navigation.navigate('FocusSession')}
        />
        <SettingsRow
          title="Digital wellbeing"
          value={formatMinutes(wellbeingSummary.minutes)}
          icon="heart"
          iconColor="#3F7DFF"
          iconBackground="#EAF1FF"
          onPress={() => setActiveModal('digitalWellbeing')}
        />
        <SettingsRow
          title="Productivity analytics"
          icon="stats-chart"
          iconColor="#8B5CF6"
          iconBackground="#F2ECFF"
          onPress={() => navigation.navigate('Analytics')}
        />
      </SectionCard>

      <SectionCard title="Notifications & Sound">
        <SettingsRow
          title="Notifications"
          value={`${plannerSummary.reminders} active`}
          icon="notifications"
          iconColor="#F59E0B"
          iconBackground="#FFF5DE"
          onPress={() => setActiveModal('notifications')}
        />
        <SettingsRow
          title="Sound & vibration"
          icon="volume-high"
          iconColor="#FB5B7D"
          iconBackground="#FFECEF"
          onPress={() => setActiveModal('sound')}
        />
        <SettingsRow
          title="Reminder alerts"
          icon="alarm"
          iconColor="#FF8A00"
          iconBackground="#FFF1DF"
          onPress={() => navigation.navigate('ReminderCenter')}
        />
      </SectionCard>

      <SectionCard title="Preferences">
        <SettingsRow
          title="Appearance / Theme"
          value={getAppearanceLabel(localPreferences.appearance)}
          icon="color-palette"
          iconColor="#8B5CF6"
          iconBackground="#F2ECFF"
          onPress={() => setActiveModal('appearance')}
        />
        <SettingsRow
          title="Language"
          value={getLanguageLabel(localPreferences.language)}
          icon="language"
          iconColor="#2F80ED"
          iconBackground="#EAF3FF"
          onPress={() => setActiveModal('language')}
        />
        <SettingsRow
          title="Accessibility"
          value={getTextSizeLabel(localPreferences.textSize)}
          icon="accessibility"
          iconColor="#0796A6"
          iconBackground="#E8FAFC"
          onPress={() => setActiveModal('accessibility')}
        />
        <SettingsRow
          title="Location"
          icon="location"
          iconColor="#16A34A"
          iconBackground="#E9F9EF"
          onPress={() => setActiveModal('location')}
        />
      </SectionCard>

      <SectionCard title="Help & About">
        <SettingsRow
          title="Tips & user guide"
          icon="help-circle"
          iconColor="#3F7DFF"
          iconBackground="#EAF1FF"
          onPress={() => setActiveModal('guide')}
        />
        <SettingsRow
          title="Report / feedback"
          icon="chatbox-ellipses"
          iconColor="#FF7A1A"
          iconBackground="#FFF1E6"
          onPress={() => setActiveModal('feedback')}
        />
        <SettingsRow
          title="About FocusMate"
          icon="information-circle"
          iconColor="#62B33F"
          iconBackground="#ECF8E8"
          onPress={() => setActiveModal('about')}
        />
        <SettingsRow
          title="Reset / Start fresh"
          icon="refresh-circle"
          iconColor={theme.colors.danger}
          iconBackground={theme.colors.dangerSoft}
          danger
          onPress={handleStartFresh}
        />
      </SectionCard>

      <View style={styles.signOutArea}>
        <AppButton
          title="Sign out"
          variant="danger"
          disabled={isResetting}
          onPress={handleSignOut}
          icon={<Ionicons name="log-out-outline" size={18} color="#FFFFFF" />}
        />
      </View>

      <ModalSheet
        visible={activeModal === 'account'}
        title="Account & Security"
        subtitle="Profile details, sign-in safety, and privacy controls."
        onClose={() => setActiveModal(null)}
      >
        <SectionCard title="Account">
          <SettingsRow
            title="Edit profile details"
            subtitle="Name, username, gender, and birthday."
            value={displayName}
            icon="create"
            iconColor={mainGreen}
            iconBackground={theme.colors.primarySoft}
            onPress={handleOpenEditProfile}
          />
          <SettingsRow
            title="Email"
            value={accountEmail || 'Not linked'}
            icon="mail"
            iconColor="#10A6A6"
            iconBackground="#E7FAFA"
            onPress={() => setActiveModal('emailInfo')}
          />
        </SectionCard>

        <SectionCard title="Security">
          <SettingsRow
            title="Change password"
            subtitle="Send a secure reset email."
            icon="key"
            iconColor="#F59E0B"
            iconBackground="#FFF5DE"
            onPress={handlePasswordReset}
          />
          <SettingsRow
            title="Verify / security check"
            icon="shield-checkmark"
            iconColor="#16A34A"
            iconBackground="#E9F9EF"
            onPress={() => setActiveModal('verify')}
          />
          <SettingsRow
            title="Privacy"
            icon="lock-closed"
            iconColor="#6B7280"
            iconBackground="#F1F4F7"
            onPress={() => setActiveModal('privacy')}
          />
        </SectionCard>
      </ModalSheet>

      <ModalSheet
        visible={activeModal === 'editProfile'}
        title="Edit profile details"
        subtitle="Saved locally for this prototype phase."
        onClose={() => setActiveModal(null)}
      >
        <Text style={styles.fieldLabel}>Name</Text>
        <TextInput
          style={styles.textInput}
          value={profileDraft.displayName}
          onChangeText={(value) => updateProfileDraft({ displayName: value })}
          placeholder="Isaac Ryan"
          placeholderTextColor={theme.colors.muted}
          autoCapitalize="words"
        />

        <Text style={styles.fieldLabel}>Username</Text>
        <TextInput
          style={styles.textInput}
          value={profileDraft.username}
          onChangeText={(value) => updateProfileDraft({ username: value })}
          placeholder="isaac_ryan"
          placeholderTextColor={theme.colors.muted}
          autoCapitalize="none"
        />

        <Text style={styles.fieldLabel}>Gender</Text>
        <View style={styles.optionStack}>
          <OptionButton
            label="Prefer not to say"
            selected={profileDraft.gender === 'Prefer not to say'}
            onPress={() => updateProfileDraft({ gender: 'Prefer not to say' })}
          />
          <OptionButton
            label="Male"
            selected={profileDraft.gender === 'Male'}
            onPress={() => updateProfileDraft({ gender: 'Male' })}
          />
          <OptionButton
            label="Female"
            selected={profileDraft.gender === 'Female'}
            onPress={() => updateProfileDraft({ gender: 'Female' })}
          />
          <OptionButton
            label="Other"
            selected={profileDraft.gender === 'Other'}
            onPress={() => updateProfileDraft({ gender: 'Other' })}
          />
        </View>

        <Text style={styles.fieldLabel}>Birthday</Text>
        <TextInput
          style={styles.textInput}
          value={profileDraft.birthday}
          onChangeText={(value) => updateProfileDraft({ birthday: value })}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={theme.colors.muted}
          autoCapitalize="none"
        />

        <Text style={styles.fieldLabel}>Email</Text>
        <View style={styles.readOnlyField}>
          <Text numberOfLines={1} style={styles.readOnlyFieldText}>
            {accountEmail || 'No Supabase email linked'}
          </Text>
          <Text style={styles.readOnlyFieldHint}>Read-only from auth</Text>
        </View>

        <View style={styles.profileEditActions}>
          <AppButton
            title="Cancel"
            variant="ghost"
            onPress={() => setActiveModal(null)}
          />
          <AppButton
            title="Save changes"
            onPress={() => void handleSaveProfileDraft()}
          />
        </View>
      </ModalSheet>

      <ModalSheet
        visible={isMiloAiSettingsVisible}
        title="Milo AI settings"
        subtitle="Shared with Talk with Milo and smart plan features."
        onClose={() => setIsMiloAiSettingsVisible(false)}
      >
        <Text style={styles.modalSectionLabel}>AI Online / Local Only</Text>
        <View style={styles.optionStack}>
          <OptionButton
            label="AI Online"
            selected={miloAiSettings.aiMode === 'online'}
            onPress={() => void handleSetAiMode('online')}
          />
          <OptionButton
            label="Local Only"
            selected={miloAiSettings.aiMode === 'local'}
            onPress={() => void handleSetAiMode('local')}
          />
        </View>

        <View style={styles.toggleCard}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleCopy}>
              <Text style={styles.toggleTitle}>Skip AI for small talk</Text>
              <Text style={styles.toggleSubtitle}>
                Let local Milo handle simple greetings and tiny replies.
              </Text>
            </View>
            <Switch
              value={miloAiSettings.skipAiForSmallTalk}
              onValueChange={(value) =>
                void handleUpdateMiloAiSettings({ skipAiForSmallTalk: value })
              }
              trackColor={{
                false: theme.colors.border,
                true: theme.colors.primarySoft,
              }}
              thumbColor={
                miloAiSettings.skipAiForSmallTalk
                  ? theme.colors.primary
                  : theme.colors.muted
              }
            />
          </View>

          <View style={styles.toggleDivider} />

          <View style={styles.toggleRow}>
            <View style={styles.toggleCopy}>
              <Text style={styles.toggleTitle}>Show debug reason</Text>
              <Text style={styles.toggleSubtitle}>
                Show why Milo used online AI or local fallback.
              </Text>
            </View>
            <Switch
              value={miloAiSettings.showDebugReason}
              onValueChange={(value) =>
                void handleUpdateMiloAiSettings({ showDebugReason: value })
              }
              trackColor={{
                false: theme.colors.border,
                true: theme.colors.primarySoft,
              }}
              thumbColor={
                miloAiSettings.showDebugReason
                  ? theme.colors.primary
                  : theme.colors.muted
              }
            />
          </View>
        </View>

        <View style={styles.usageCard}>
          <CircleIcon
            icon="flash"
            color={mainGreen}
            backgroundColor={theme.colors.primarySoft}
          />
          <View style={styles.usageCopy}>
            <Text style={styles.usageLabel}>AI calls today</Text>
            <Text style={styles.usageValue}>{miloAiSettings.aiCallsToday}</Text>
          </View>
        </View>

        <AppButton
          title="Reset AI settings"
          variant="ghost"
          onPress={handleResetMiloAiSettings}
          icon={<Ionicons name="refresh" size={17} color={theme.colors.text} />}
        />
      </ModalSheet>

      <ModalSheet
        visible={activeModal === 'emailInfo'}
        title="Email"
        subtitle="Read-only account email."
        onClose={() => setActiveModal(null)}
      >
        <InfoPanel
          icon="mail"
          title={accountEmail || 'No email linked'}
          message={
            accountEmail
              ? 'This email comes from the current Supabase auth user and is linked to this FocusMate account.'
              : 'This looks like a local demo session, so no Supabase auth email is linked right now.'
          }
        />
        <BulletLine>
          Email is read-only here to keep account changes safe for the prototype.
        </BulletLine>
      </ModalSheet>

      <ModalSheet
        visible={activeModal === 'verify'}
        title="Security check"
        subtitle="A clear checklist without fake verification."
        onClose={() => setActiveModal(null)}
      >
        <InfoPanel
          icon="shield-checkmark"
          title="FocusMate security posture"
          message="This screen summarizes what is active now and what remains protected by confirmation flows."
        />
        <BulletLine>
          Supabase session is used when an email account is signed in.
        </BulletLine>
        <BulletLine>
          Password changes use Supabase password reset instead of storing secrets
          in the app.
        </BulletLine>
        <BulletLine>
          Milo task create, update, complete, and delete actions require user
          confirmation before changing planner data.
        </BulletLine>
        <BulletLine>
          AI Online calls use the Supabase Edge Function, keeping service keys
          out of the mobile app.
        </BulletLine>
      </ModalSheet>

      <ModalSheet
        visible={activeModal === 'privacy'}
        title="Privacy"
        subtitle="What FocusMate stores and how Milo AI is protected."
        onClose={() => setActiveModal(null)}
      >
        <InfoText>
          FocusMate stores task data for the signed-in user through Supabase when
          an account session is available. Some prototype preferences, including
          username, gender, birthday, local display name, language, and theme
          choice, are stored locally on this device.
        </InfoText>
        <BulletLine>
          Milo AI Online uses the Supabase Edge Function securely.
        </BulletLine>
        <BulletLine>
          The OpenAI key is not stored inside the mobile app.
        </BulletLine>
        <BulletLine>
          Local Milo Brain can still work when AI Online is off or unavailable.
        </BulletLine>
        <BulletLine>
          Task create, update, and delete actions from Milo require user
          confirmation before they are applied.
        </BulletLine>
      </ModalSheet>

      <ModalSheet
        visible={activeModal === 'digitalWellbeing'}
        title="Digital wellbeing"
        subtitle="Real activity from this device."
        onClose={() => setActiveModal(null)}
      >
        {wellbeingSummary.sessions > 0 || tasks.length > 0 ? (
          <>
            <View style={styles.statGrid}>
              <StatPill
                label="Focus time"
                value={formatMinutes(wellbeingSummary.minutes)}
              />
              <StatPill
                label="Focus sessions"
                value={`${wellbeingSummary.sessions}`}
              />
              <StatPill
                label="Pending items"
                value={`${plannerSummary.pending}`}
              />
              <StatPill
                label="Reminders"
                value={`${plannerSummary.reminders}`}
              />
            </View>
            <InfoText>
              This summary uses saved focus sessions and planner items already in
              FocusMate. No fake streaks or placeholder numbers are added.
            </InfoText>
          </>
        ) : (
          <View style={styles.emptyInfoCard}>
            <Ionicons name="leaf-outline" size={28} color={mainGreen} />
            <Text style={styles.emptyInfoTitle}>No activity yet</Text>
            <Text style={styles.emptyInfoText}>
              Start Focus Mode or create planner items and Milo will summarize
              real activity here.
            </Text>
          </View>
        )}
      </ModalSheet>

      <ModalSheet
        visible={activeModal === 'notifications'}
        title="Notifications"
        subtitle="Choose how FocusMate keeps reminders intentional."
        onClose={() => setActiveModal(null)}
      >
        <View style={styles.modalActionCard}>
          <ModalActionRow
            title="In-app notifications"
            icon="notifications-circle"
            iconColor="#F59E0B"
            iconBackground="#FFF5DE"
            onPress={() => setActiveModal('inAppNotifications')}
          />
          <ModalActionRow
            title="Push notification schedule"
            subtitle="Set a schedule to turn off push notifications."
            icon="moon"
            iconColor="#6366F1"
            iconBackground="#EEF0FF"
            onPress={() => setActiveModal('pushSchedule')}
          />
        </View>
      </ModalSheet>

      <ModalSheet
        visible={activeModal === 'inAppNotifications'}
        title="In-app notifications"
        subtitle="Local app notification behavior for this prototype."
        onClose={() => setActiveModal('notifications')}
      >
        <InfoPanel
          icon="notifications"
          title="In-app notification controls"
          message="FocusMate can show reminder context inside the app through Reminder Center and planner screens. Deeper per-category toggles are planned for a later phase."
        />
        <BulletLine>
          Reminder Center remains the source of truth for current reminder items.
        </BulletLine>
        <BulletLine>
          Milo will keep reminder language calm and useful instead of noisy.
        </BulletLine>
      </ModalSheet>

      <ModalSheet
        visible={activeModal === 'pushSchedule'}
        title="Push notification schedule"
        subtitle="Coming soon"
        onClose={() => setActiveModal('notifications')}
      >
        <InfoPanel
          icon="moon"
          title="Quiet schedule planned"
          message="A schedule to turn off push notifications is not implemented yet. This keeps the UI honest while leaving a clear place for the feature."
        />
        <BulletLine>
          No fake schedule is saved in this prototype phase.
        </BulletLine>
        <BulletLine>
          Existing task reminder behavior stays available through Reminder Center.
        </BulletLine>
      </ModalSheet>

      <ModalSheet
        visible={activeModal === 'sound'}
        title="Sound & vibration"
        subtitle="Reminder sound controls for future builds."
        onClose={() => setActiveModal(null)}
      >
        <InfoPanel
          icon="volume-high"
          title="Sound controls"
          message="FocusMate keeps this phase safe by using supported reminder audio and haptics only."
        />
        <BulletLine>App reminder sounds use supported Expo notification audio.</BulletLine>
        <BulletLine>
          Vibration and haptics can support timer and reminder feedback.
        </BulletLine>
        <BulletLine>
          Device ringtone and deeper audio controls are planned when native
          support is safe to add.
        </BulletLine>
      </ModalSheet>

      <ModalSheet
        visible={activeModal === 'appearance'}
        title="Appearance / Theme"
        subtitle="Saved locally for Phase 11A."
        onClose={() => setActiveModal(null)}
      >
        <View style={styles.optionStack}>
          <OptionButton
            label="System"
            selected={localPreferences.appearance === 'system'}
            onPress={() => void handleSelectAppearance('system')}
          />
          <OptionButton
            label="Light"
            selected={localPreferences.appearance === 'light'}
            onPress={() => void handleSelectAppearance('light')}
          />
          <OptionButton
            label="Dark"
            selected={localPreferences.appearance === 'dark'}
            onPress={() => void handleSelectAppearance('dark')}
          />
        </View>
        <InfoText>
          FocusMate is still rendered with the current light theme. This stores
          the user preference so global theming can connect later.
        </InfoText>
      </ModalSheet>

      <ModalSheet
        visible={activeModal === 'language'}
        title="Language"
        subtitle="Saved locally for Phase 11A."
        onClose={() => setActiveModal(null)}
      >
        <View style={styles.optionStack}>
          <OptionButton
            label="English"
            selected={localPreferences.language === 'english'}
            onPress={() => void handleSelectLanguage('english')}
          />
          <OptionButton
            label="Bahasa Melayu"
            selected={localPreferences.language === 'ms'}
            onPress={() => void handleSelectLanguage('ms')}
          />
        </View>
        <InfoText>
          Full app translation is coming later. For now, this preference is saved
          locally and ready for i18n wiring.
        </InfoText>
      </ModalSheet>

      <ModalSheet
        visible={activeModal === 'accessibility'}
        title="Accessibility"
        subtitle="Local preferences for readability and motion."
        onClose={() => setActiveModal(null)}
      >
        <Text style={styles.modalSectionLabel}>Text size & readability</Text>
        <View style={styles.optionStack}>
          <OptionButton
            label="Comfortable"
            selected={localPreferences.textSize === 'comfortable'}
            onPress={() => void handleSavePreferences({ textSize: 'comfortable' })}
          />
          <OptionButton
            label="Large"
            selected={localPreferences.textSize === 'large'}
            onPress={() => void handleSavePreferences({ textSize: 'large' })}
          />
        </View>

        <View style={styles.toggleCard}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleCopy}>
              <Text style={styles.toggleTitle}>Reduced motion</Text>
              <Text style={styles.toggleSubtitle}>
                Store a preference for calmer transitions later.
              </Text>
            </View>
            <Switch
              value={localPreferences.reducedMotion}
              onValueChange={(value) =>
                void handleSavePreferences({ reducedMotion: value })
              }
            />
          </View>
          <View style={styles.toggleDivider} />
          <View style={styles.toggleRow}>
            <View style={styles.toggleCopy}>
              <Text style={styles.toggleTitle}>Clear contrast</Text>
              <Text style={styles.toggleSubtitle}>
                Keep stronger contrast as the default FocusMate style.
              </Text>
            </View>
            <Switch
              value={localPreferences.clearContrast}
              onValueChange={(value) =>
                void handleSavePreferences({ clearContrast: value })
              }
            />
          </View>
        </View>
      </ModalSheet>

      <ModalSheet
        visible={activeModal === 'location'}
        title="Location"
        subtitle="For meetings, tasks, and map handoff."
        onClose={() => setActiveModal(null)}
      >
        <BulletLine>
          FocusMate uses task and meeting locations to help Milo prepare routes,
          venue reminders, and context.
        </BulletLine>
        <BulletLine>
          Existing planner items can open device map apps when a saved location is
          available.
        </BulletLine>
        <BulletLine>
          Deeper permission-based location features can be added later without
          changing the mobile auth model.
        </BulletLine>
      </ModalSheet>

      <ModalSheet
        visible={activeModal === 'guide'}
        title="Tips & user guide"
        subtitle="A quick FocusMate walkthrough."
        onClose={() => setActiveModal(null)}
      >
        <BulletLine>Create tasks, dates, or meetings from the center plus button.</BulletLine>
        <BulletLine>Use Calendar to review upcoming planner items by date.</BulletLine>
        <BulletLine>Talk with Milo for planning help, task updates, and gentle guidance.</BulletLine>
        <BulletLine>Open Plan Prep from task details when a task needs a smart plan.</BulletLine>
        <BulletLine>Start Focus Mode when you want Milo to help you stay locked in.</BulletLine>
      </ModalSheet>

      <ModalSheet
        visible={activeModal === 'feedback'}
        title="Report / feedback"
        subtitle="Prototype-friendly feedback capture."
        onClose={() => setActiveModal(null)}
      >
        <InfoText>
          A backend feedback inbox is not connected yet. For now, FocusMate can
          open an email draft or you can record feedback in your FYP notes.
        </InfoText>
        <AppButton
          title="Open email draft"
          variant="secondary"
          onPress={() => void handleOpenFeedbackEmail()}
          icon={<Ionicons name="mail-outline" size={17} color={mainGreen} />}
        />
      </ModalSheet>

      <ModalSheet
        visible={activeModal === 'about'}
        title="About FocusMate"
        subtitle="Milo, planning, and secure AI."
        onClose={() => setActiveModal(null)}
      >
        <View style={styles.aboutHeader}>
          <Image source={miloAvatarImage} style={styles.aboutMilo} />
          <View style={styles.aboutCopy}>
            <Text style={styles.aboutTitle}>FocusMate</Text>
            <Text style={styles.aboutText}>FYP prototype - v{APP_VERSION}</Text>
            <Text style={styles.aboutText}>Made by Isaac Ryan</Text>
          </View>
        </View>
        <BulletLine>Milo Brain uses hybrid AI.</BulletLine>
        <BulletLine>OpenAI key is not stored in the app.</BulletLine>
        <BulletLine>
          AI Online uses a Supabase Edge Function securely.
        </BulletLine>
        <BulletLine>
          Local fallback keeps core FocusMate features working.
        </BulletLine>
      </ModalSheet>

      <ModalSheet
        visible={activeModal === 'bluetooth'}
        title="Bluetooth"
        subtitle="Coming soon"
        onClose={() => setActiveModal(null)}
      >
        <InfoText>
          Bluetooth support is coming soon for FocusMate device integrations.
        </InfoText>
      </ModalSheet>

      <ModalSheet
        visible={activeModal === 'devices'}
        title="Connected devices"
        subtitle="Coming soon"
        onClose={() => setActiveModal(null)}
      >
        <InfoText>
          Connected devices support is coming soon for heart/pulse sensor and
          focus device integrations.
        </InfoText>
      </ModalSheet>

      <SettingsDialogModal
        dialog={dialog}
        onClose={() => setDialog(null)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: theme.colors.backgroundSoft,
  },
  screenContent: {
    paddingHorizontal: 14,
  },
  screenTitle: {
    color: theme.colors.text,
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 8,
  },
  profileCard: {
    minHeight: 72,
    borderRadius: 18,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: '#EEF2F5',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
    ...theme.shadowSoft,
  },
  profileCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  profileName: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  profileSubtitle: {
    marginTop: 4,
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  avatarRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 2,
    borderColor: '#9DF0A8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 7,
  },
  avatarImage: {
    width: 42,
    height: 42,
    resizeMode: 'contain',
  },
  sectionWrap: {
    marginBottom: 8,
  },
  sectionTitle: {
    marginLeft: 5,
    marginBottom: 5,
    color: mainGreen,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  sectionCard: {
    borderRadius: 16,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: '#EDF1F4',
    overflow: 'hidden',
    ...theme.shadowSoft,
  },
  settingsRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8EDF2',
  },
  circleIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  rowTextArea: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  rowTitle: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  rowSubtitle: {
    marginTop: 2,
    color: theme.colors.muted,
    fontSize: 10,
    fontWeight: '700',
  },
  rowValue: {
    maxWidth: 104,
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '800',
    marginRight: 7,
  },
  dangerText: {
    color: theme.colors.danger,
  },
  signOutArea: {
    marginTop: 14,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(34, 40, 49, 0.34)',
  },
  modalKeyboardArea: {
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: theme.colors.backgroundSoft,
    paddingTop: 9,
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  modalHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D5DCE4',
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  modalHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  modalTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  modalSubtitle: {
    marginTop: 4,
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    paddingBottom: 24,
  },
  dialogRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  dialogBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(34, 40, 49, 0.38)',
  },
  dialogCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 20,
    alignItems: 'center',
    ...theme.shadow,
  },
  dialogIconBubble: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  dialogTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  dialogMessage: {
    marginTop: 8,
    color: theme.colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'center',
  },
  dialogActions: {
    width: '100%',
    gap: 10,
    marginTop: 18,
  },
  modalSectionLabel: {
    marginLeft: 4,
    marginBottom: 8,
    color: mainGreen,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  modalActionCard: {
    borderRadius: 18,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    marginBottom: 14,
  },
  modalActionRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  modalActionCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },
  modalActionTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  modalActionSubtitle: {
    marginTop: 3,
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
  },
  infoPanel: {
    borderRadius: 18,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  infoPanelCopy: {
    flex: 1,
    minWidth: 0,
    marginLeft: 11,
  },
  infoPanelTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  infoPanelMessage: {
    marginTop: 4,
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  infoText: {
    color: theme.colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 12,
  },
  bulletLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginBottom: 10,
  },
  bulletDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: mainGreen,
    marginTop: 7,
  },
  bulletText: {
    flex: 1,
    color: theme.colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
  },
  optionStack: {
    gap: 9,
    marginBottom: 14,
  },
  optionButton: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  optionButtonSelected: {
    borderColor: '#9DE7B2',
    backgroundColor: theme.colors.primarySoft,
  },
  optionButtonText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  optionButtonTextSelected: {
    color: mainGreen,
  },
  toggleCard: {
    borderRadius: 18,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 13,
    marginBottom: 14,
  },
  toggleRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toggleCopy: {
    flex: 1,
    minWidth: 0,
  },
  toggleTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  toggleSubtitle: {
    marginTop: 3,
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
  },
  toggleDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
  },
  usageCard: {
    borderRadius: 18,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  usageCopy: {
    marginLeft: 11,
  },
  usageLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '800',
  },
  usageValue: {
    marginTop: 2,
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  textInput: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 14,
  },
  fieldLabel: {
    marginLeft: 4,
    marginBottom: 7,
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  readOnlyField: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    justifyContent: 'center',
    marginBottom: 14,
  },
  readOnlyFieldText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  readOnlyFieldHint: {
    marginTop: 3,
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  profileEditActions: {
    gap: 10,
    marginTop: 4,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  statPill: {
    width: '48%',
    borderRadius: 18,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 13,
  },
  statPillValue: {
    color: mainGreen,
    fontSize: 18,
    fontWeight: '900',
  },
  statPillLabel: {
    marginTop: 4,
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '800',
  },
  emptyInfoCard: {
    minHeight: 170,
    borderRadius: 20,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  emptyInfoTitle: {
    marginTop: 10,
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptyInfoText: {
    marginTop: 5,
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
  aboutHeader: {
    borderRadius: 20,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  aboutMilo: {
    width: 62,
    height: 62,
    resizeMode: 'contain',
    marginRight: 12,
  },
  aboutCopy: {
    flex: 1,
    minWidth: 0,
  },
  aboutTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  aboutText: {
    marginTop: 3,
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
  },
});
