import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { theme } from '../theme';
import { useAuth } from '../lib/AuthContext';

const miloIdleImage = require('../../assets/mascot/milo_idle.png');

export default function RegisterScreen() {
  const navigation = useNavigation<any>();
  const { signIn } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleRegister = async () => {
    if (isLoading) return;

    setIsLoading(true);
    await signIn(name.trim() || 'Student');
    setIsLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>

        <Text style={styles.title}>Create your planner</Text>
        <Text style={styles.subtitle}>
          Milo will help you manage tasks, meetings, reminders, and focus sessions.
        </Text>

        <LinearGradient
          colors={['#F9FFFB', '#DDF8E7']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.companionPreview}
        >
          <View style={styles.miloBubble}>
            <Image source={miloIdleImage} style={styles.miloImage} resizeMode="contain" />
          </View>

          <View style={styles.speechBubble}>
            <Text style={styles.speechTitle}>Hi, I’m Milo!</Text>
            <Text style={styles.speechText}>
              I’ll help you remember what matters and break big goals into small steps.
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.formCard}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Full name</Text>

            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={20} color={theme.colors.muted} />
              <TextInput
                style={styles.input}
                placeholder="Example: Aina"
                placeholderTextColor={theme.colors.muted}
                value={name}
                onChangeText={setName}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email address</Text>

            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={20} color={theme.colors.muted} />
              <TextInput
                style={styles.input}
                placeholder="example@email.com"
                placeholderTextColor={theme.colors.muted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </View>

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={handleRegister}
            disabled={isLoading}
          >
            <LinearGradient
              colors={[theme.colors.primary, theme.colors.primaryDark]}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>
                {isLoading ? 'Creating...' : 'Create Account'}
              </Text>
              <Ionicons name="sparkles" size={19} color="#FFFFFF" />
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={styles.loginLink} onPress={() => navigation.goBack()}>
            <Text style={styles.loginText}>
              Already have an account?{' '}
              <Text style={styles.loginTextStrong}>Login</Text>
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.demoNote}>
          This is still demo authentication. Real Supabase login will be added later.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 52,
    paddingBottom: 32,
  },
  backButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 24,
    ...theme.shadow,
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    color: theme.colors.text,
    letterSpacing: -0.7,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 15,
    color: theme.colors.muted,
    lineHeight: 22,
    fontWeight: '600',
    marginBottom: 24,
  },
  companionPreview: {
    minHeight: 190,
    borderRadius: theme.radius.xl,
    marginBottom: 22,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    ...theme.shadow,
  },
  miloBubble: {
    width: 118,
    height: 118,
    borderRadius: 59,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    ...theme.shadow,
  },
  miloImage: {
    width: 128,
    height: 128,
  },
  speechBubble: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    ...theme.shadow,
  },
  speechTitle: {
    color: theme.colors.primaryDark,
    fontWeight: '900',
    fontSize: 16,
    marginBottom: 5,
  },
  speechText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
    lineHeight: 21,
  },
  formCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 22,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow,
  },
  inputGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.textSoft,
    marginBottom: 8,
  },
  inputWrapper: {
    height: 56,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
    color: theme.colors.text,
    fontWeight: '600',
  },
  primaryButton: {
    height: 58,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 16,
    marginRight: 8,
  },
  loginLink: {
    marginTop: 18,
    alignItems: 'center',
  },
  loginText: {
    color: theme.colors.muted,
    fontWeight: '700',
  },
  loginTextStrong: {
    color: theme.colors.primaryDark,
    fontWeight: '900',
  },
  demoNote: {
    marginTop: 20,
    color: theme.colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    fontWeight: '600',
  },
});