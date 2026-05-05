import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { theme } from '../theme';

const miloFocusedImage = require('../../assets/mascot/milo_focused.png');
const miloHappyImage = require('../../assets/mascot/milo_happy.png');
const miloWorriedImage = require('../../assets/mascot/milo_worried.png');

type StatusType = 'ready' | 'planned' | 'future';

function StatusBadge({ status }: { status: StatusType }) {
  const config =
    status === 'ready'
      ? {
          label: 'MVP Ready',
          color: theme.colors.primaryDark,
          background: theme.colors.primarySoft,
        }
      : status === 'planned'
      ? {
          label: 'Planned',
          color: theme.colors.purple,
          background: theme.colors.purpleSoft,
        }
      : {
          label: 'Future',
          color: theme.colors.yellow,
          background: theme.colors.yellowSoft,
        };

  return (
    <View style={[styles.statusBadge, { backgroundColor: config.background }]}>
      <Text style={[styles.statusText, { color: config.color }]}>
        {config.label}
      </Text>
    </View>
  );
}

function ModuleCard({
  title,
  description,
  icon,
  color,
  background,
  status,
  points,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  background: string;
  status: StatusType;
  points: string[];
}) {
  return (
    <View style={styles.moduleCard}>
      <View style={styles.moduleHeader}>
        <View style={[styles.moduleIcon, { backgroundColor: color }]}>
          {icon}
        </View>

        <View style={styles.moduleTitleArea}>
          <Text style={styles.moduleTitle}>{title}</Text>
          <Text style={styles.moduleDescription}>{description}</Text>
        </View>

        <StatusBadge status={status} />
      </View>

      <View style={[styles.pointBox, { backgroundColor: background }]}>
        {points.map((point) => (
          <View key={point} style={styles.pointRow}>
            <Ionicons name="checkmark-circle" size={16} color={color} />
            <Text style={styles.pointText}>{point}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ArchitectureStep({
  number,
  title,
  description,
}: {
  number: number;
  title: string;
  description: string;
}) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{number}</Text>
      </View>

      <View style={styles.stepTextArea}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepDescription}>{description}</Text>
      </View>
    </View>
  );
}

export default function IntegrationCenterScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <LinearGradient
          colors={['#F7FFF9', '#DDF8E7']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroTextArea}>
            <Text style={styles.heroLabel}>FYP System Design</Text>
            <Text style={styles.heroTitle}>AI & Backend Plan</Text>
            <Text style={styles.heroSubtitle}>
              Milo can become smarter later by connecting the mobile app to a secure backend.
            </Text>
          </View>

          <Image
            source={miloFocusedImage}
            style={styles.heroMilo}
            resizeMode="contain"
          />
        </LinearGradient>

        <View style={styles.mvpCard}>
          <Image
            source={miloHappyImage}
            style={styles.mvpMilo}
            resizeMode="contain"
          />

          <View style={styles.mvpTextArea}>
            <Text style={styles.mvpTitle}>Current Prototype</Text>
            <Text style={styles.mvpText}>
              The current FocusMate MVP already supports local planner items,
              reminders, Milo checklists, focus timer, and analytics.
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Backend Modules</Text>

        <ModuleCard
          title="OpenAI Planning"
          description="For smarter Milo responses and task breakdowns."
          status="planned"
          color={theme.colors.primary}
          background={theme.colors.primarySoft}
          icon={<Ionicons name="sparkles" size={22} color="#FFFFFF" />}
          points={[
            'Generate personalized task steps',
            'Suggest what to do first',
            'Create daily planning advice',
            'Must be called from backend, not directly from app',
          ]}
        />

        <ModuleCard
          title="WhatsApp Reminders"
          description="For sending external reminders through WhatsApp."
          status="future"
          color={theme.colors.purple}
          background={theme.colors.purpleSoft}
          icon={<Ionicons name="logo-whatsapp" size={22} color="#FFFFFF" />}
          points={[
            'Send task reminders',
            'Send meeting reminders',
            'Needs backend scheduler',
            'Useful for users who miss phone notifications',
          ]}
        />

        <ModuleCard
          title="Supabase Database"
          description="For real user accounts and cloud data storage."
          status="planned"
          color={theme.colors.blue}
          background={theme.colors.blueSoft}
          icon={<MaterialCommunityIcons name="database" size={22} color="#FFFFFF" />}
          points={[
            'Store users and planner items',
            'Store checklist progress',
            'Store focus analytics',
            'Sync data across devices',
          ]}
        />

        <ModuleCard
          title="Local MVP"
          description="Features that already work in the current prototype."
          status="ready"
          color={theme.colors.primaryDark}
          background={theme.colors.primarySoft}
          icon={<Ionicons name="phone-portrait" size={22} color="#FFFFFF" />}
          points={[
            'Task, date, and meeting management',
            'Local phone notifications',
            'Milo smart checklist',
            'Focus timer and analytics',
          ]}
        />

        <View style={styles.warningCard}>
          <Image
            source={miloWorriedImage}
            style={styles.warningMilo}
            resizeMode="contain"
          />

          <View style={styles.warningTextArea}>
            <Text style={styles.warningTitle}>Important Security Rule</Text>
            <Text style={styles.warningText}>
              Do not put OpenAI or WhatsApp API keys inside the React Native app.
              The mobile app should send requests to a backend, and the backend
              should securely call external APIs.
            </Text>
          </View>
        </View>

        <View style={styles.architectureCard}>
          <Text style={styles.architectureTitle}>Suggested Final Architecture</Text>

          <ArchitectureStep
            number={1}
            title="Mobile App"
            description="User creates tasks, meetings, dates, and asks Milo for help."
          />

          <ArchitectureStep
            number={2}
            title="Backend API"
            description="Receives requests from the app and protects secret API keys."
          />

          <ArchitectureStep
            number={3}
            title="OpenAI / WhatsApp"
            description="Backend calls AI or reminder services securely."
          />

          <ArchitectureStep
            number={4}
            title="Supabase"
            description="Stores users, planner data, reminder data, and analytics."
          />
        </View>

        <View style={styles.fypCard}>
          <Text style={styles.fypTitle}>How to Explain This in FYP</Text>
          <Text style={styles.fypText}>
            The prototype focuses on the mobile user experience first. The AI and
            WhatsApp modules are designed as backend-based extensions so the final
            system can be secure, scalable, and suitable for real users.
          </Text>
        </View>

        <View style={{ height: 110 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  heroCard: {
    minHeight: 180,
    borderRadius: 30,
    padding: 18,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    ...theme.shadow,
  },
  heroTextArea: {
    flex: 1,
    paddingRight: 8,
  },
  heroLabel: {
    color: theme.colors.primaryDark,
    fontWeight: '900',
    fontSize: 12,
    marginBottom: 5,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  heroSubtitle: {
    marginTop: 7,
    color: theme.colors.textSoft,
    fontWeight: '700',
    lineHeight: 20,
    fontSize: 13,
  },
  heroMilo: {
    width: 125,
    height: 125,
    marginRight: -8,
  },
  mvpCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    padding: 15,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow,
  },
  mvpMilo: {
    width: 72,
    height: 72,
    marginRight: 11,
  },
  mvpTextArea: {
    flex: 1,
  },
  mvpTitle: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 15,
  },
  mvpText: {
    marginTop: 5,
    color: theme.colors.muted,
    fontWeight: '600',
    lineHeight: 19,
    fontSize: 12,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 21,
    marginBottom: 12,
  },
  moduleCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 25,
    padding: 15,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow,
  },
  moduleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  moduleIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 11,
  },
  moduleTitleArea: {
    flex: 1,
    paddingRight: 8,
  },
  moduleTitle: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 15,
  },
  moduleDescription: {
    marginTop: 4,
    color: theme.colors.muted,
    fontWeight: '600',
    lineHeight: 17,
    fontSize: 12,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '900',
  },
  pointBox: {
    borderRadius: 18,
    padding: 12,
    marginTop: 13,
  },
  pointRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  pointText: {
    flex: 1,
    marginLeft: 7,
    color: theme.colors.textSoft,
    fontWeight: '700',
    lineHeight: 18,
    fontSize: 12,
  },
  warningCard: {
    backgroundColor: '#FFF0F0',
    borderRadius: 24,
    padding: 15,
    marginTop: 2,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  warningMilo: {
    width: 76,
    height: 76,
    marginRight: 10,
  },
  warningTextArea: {
    flex: 1,
  },
  warningTitle: {
    color: theme.colors.danger,
    fontWeight: '900',
    marginBottom: 5,
    fontSize: 14,
  },
  warningText: {
    color: theme.colors.textSoft,
    fontWeight: '700',
    lineHeight: 19,
    fontSize: 12,
  },
  architectureCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 25,
    padding: 15,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow,
  },
  architectureTitle: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 18,
    marginBottom: 12,
  },
  stepRow: {
    flexDirection: 'row',
    backgroundColor: theme.colors.background,
    borderRadius: 17,
    padding: 11,
    marginBottom: 9,
  },
  stepNumber: {
    width: 29,
    height: 29,
    borderRadius: 15,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  stepNumberText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  stepTextArea: {
    flex: 1,
  },
  stepTitle: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 13,
  },
  stepDescription: {
    marginTop: 3,
    color: theme.colors.muted,
    fontWeight: '600',
    lineHeight: 17,
    fontSize: 12,
  },
  fypCard: {
    backgroundColor: theme.colors.yellowSoft,
    borderRadius: 20,
    padding: 15,
  },
  fypTitle: {
    color: theme.colors.text,
    fontWeight: '900',
    marginBottom: 6,
    fontSize: 14,
  },
  fypText: {
    color: theme.colors.textSoft,
    fontWeight: '600',
    lineHeight: 19,
    fontSize: 12,
  },
});