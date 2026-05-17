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

const miloHeroImage = require('../../assets/mascot/milo_hero.png');

export default function LoginScreen() {
  const navigation = useNavigation<any>();
  const { signInWithEmail } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleLogin = async () => {
    if (isLoading) return;

    setErrorMessage('');
    setIsLoading(true);

    try {
      const result = await signInWithEmail(email, password);

      if (!result.success) {
        setErrorMessage(
          result.error || 'Milo could not sign you in. Please try again.'
        );
      }
    } catch {
      setErrorMessage('Milo could not sign you in. Please try again.');
    } finally {
      setIsLoading(false);
    }
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
        <View style={styles.logoRow}>
          <View style={styles.logoBox}>
            <Ionicons name="checkmark" size={28} color="#FFFFFF" />
          </View>

          <View>
            <Text style={styles.logoTitle}>FocusMate</Text>
            <Text style={styles.logoSubtitle}>AI-Powered Planner</Text>
          </View>
        </View>

        <LinearGradient
          colors={['#58C878', '#8DE3A5']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroTextArea}>
            <Text style={styles.heroSmallText}>Meet</Text>
            <Text style={styles.heroTitle}>Milo</Text>
            <Text style={styles.heroDescription}>
              Your friendly dino companion who helps you focus, plan, and
              remember important tasks.
            </Text>

            <View style={styles.featureRow}>
              <View style={styles.featurePill}>
                <Ionicons name="checkmark-circle" size={14} color={theme.colors.primaryDark} />
                <Text style={styles.featureText}>Focus</Text>
              </View>

              <View style={styles.featurePill}>
                <Ionicons name="calendar" size={14} color={theme.colors.primaryDark} />
                <Text style={styles.featureText}>Plan</Text>
              </View>
            </View>
          </View>

          <View style={styles.miloArea}>
            <View style={styles.miloGlow} />
            <Image source={miloHeroImage} style={styles.miloImage} resizeMode="contain" />
          </View>
        </LinearGradient>

        <View style={styles.formCard}>
          <Text style={styles.welcomeTitle}>Welcome back</Text>
          <Text style={styles.welcomeText}>
            Let's organize your day.
          </Text>

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
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>

            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color={theme.colors.muted} />
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor={theme.colors.muted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          {errorMessage ? (
            <Text style={styles.errorText}>{errorMessage}</Text>
          ) : null}

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={handleLogin}
            disabled={isLoading}
          >
            <LinearGradient
              colors={[theme.colors.primary, theme.colors.primaryDark]}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>
                {isLoading ? 'Signing in...' : 'Login'}
              </Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('Register')}
          >
            <Text style={styles.secondaryText}>
              New here?{' '}
              <Text style={styles.secondaryTextStrong}>Create account</Text>
            </Text>
          </TouchableOpacity>
        </View>
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
    paddingTop: 56,
    paddingBottom: 32,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 28,
  },
  logoBox: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    ...theme.shadow,
  },
  logoTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: theme.colors.text,
  },
  logoSubtitle: {
    fontSize: 13,
    color: theme.colors.muted,
    fontWeight: '700',
    marginTop: 1,
  },
  heroCard: {
    borderRadius: theme.radius.xl,
    padding: 22,
    minHeight: 250,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 24,
    ...theme.shadow,
  },
  heroTextArea: {
    width: '52%',
    zIndex: 2,
  },
  heroSmallText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    opacity: 0.95,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 58,
    fontWeight: '900',
    letterSpacing: -1,
    marginTop: 2,
  },
  heroDescription: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
    opacity: 0.95,
    marginTop: 4,
  },
  featureRow: {
    flexDirection: 'row',
    marginTop: 16,
  },
  featurePill: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  featureText: {
    marginLeft: 5,
    color: theme.colors.primaryDark,
    fontWeight: '900',
    fontSize: 11,
  },
  miloArea: {
    flex: 1,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
  },
  miloGlow: {
    position: 'absolute',
    width: 175,
    height: 175,
    borderRadius: 88,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  miloImage: {
    width: 220,
    height: 220,
  },
  formCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 22,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow,
  },
  welcomeTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: theme.colors.text,
  },
  welcomeText: {
    color: theme.colors.muted,
    fontWeight: '600',
    lineHeight: 21,
    marginTop: 6,
    marginBottom: 22,
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
  errorText: {
    color: '#D14343',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    marginTop: -4,
    marginBottom: 14,
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
  secondaryButton: {
    marginTop: 18,
    alignItems: 'center',
  },
  secondaryText: {
    color: theme.colors.muted,
    fontWeight: '700',
  },
  secondaryTextStrong: {
    color: theme.colors.primaryDark,
    fontWeight: '900',
  },
});
