import React, { useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { theme } from '../theme';
import { useFocusMateTheme } from '../theme/FocusMateThemeProvider';
import ScreenContainer from '../components/ui/ScreenContainer';
import AppButton from '../components/ui/AppButton';

const miloWavingImage = require('../../assets/mascot/milo_waving.png');
const miloFocusedImage = require('../../assets/mascot/milo_focused.png');
const miloHappyImage = require('../../assets/mascot/milo_happy.png');
const miloCelebratingImage = require('../../assets/mascot/milo_celebrating.png');

type OnboardingScreenProps = {
  onFinish: () => void;
};

type Slide = {
  id: string;
  label: string;
  title: string;
  message: string;
  image: any;
  icon: React.ReactNode;
};

export default function OnboardingScreen({ onFinish }: OnboardingScreenProps) {
  useFocusMateTheme();

  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<Slide>>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const slides: Slide[] = useMemo(
    () => [
      {
        id: 'milo',
        label: 'Meet Milo',
        title: 'Your friendly planning dino',
        message: 'Milo helps with tasks, dates, meetings, reminders, and focus.',
        image: miloWavingImage,
        icon: <Ionicons name="heart" size={18} color={theme.colors.primaryDark} />,
      },
      {
        id: 'planner',
        label: 'Plan smarter',
        title: 'Organize tasks, dates, and meetings',
        message: 'Create items with priority, time, place, and reminders.',
        image: miloFocusedImage,
        icon: (
          <Ionicons
            name="calendar-outline"
            size={18}
            color={theme.colors.primaryDark}
          />
        ),
      },
      {
        id: 'reminders',
        label: 'Remember more',
        title: 'Let Milo remind you',
        message: 'Set reminders so Milo can help you remember.',
        image: miloHappyImage,
        icon: (
          <Ionicons
            name="notifications-outline"
            size={18}
            color={theme.colors.primaryDark}
          />
        ),
      },
      {
        id: 'focus',
        label: 'Stay focused',
        title: 'Break work into small steps',
        message: 'Milo turns big items into small checklist steps.',
        image: miloCelebratingImage,
        icon: (
          <MaterialCommunityIcons
            name="target"
            size={18}
            color={theme.colors.primaryDark}
          />
        ),
      },
    ],
    []
  );

  const isLastSlide = activeIndex === slides.length - 1;

  const handleScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>
  ) => {
    const nextIndex = Math.round(
      event.nativeEvent.contentOffset.x / width
    );

    setActiveIndex(nextIndex);
  };

  const handleNext = () => {
    if (isLastSlide) {
      onFinish();
      return;
    }

    listRef.current?.scrollToIndex({
      index: activeIndex + 1,
      animated: true,
    });

    setActiveIndex((current) => current + 1);
  };

  const renderSlide = ({ item }: { item: Slide }) => {
    return (
      <View style={[styles.slide, { width }]}>
        <LinearGradient
          colors={['#F7FFF9', '#DDF8E7']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.softShape} />

          <View style={styles.labelPill}>
            {item.icon}
            <Text style={styles.labelText}>{item.label}</Text>
          </View>

          <Image
            source={item.image}
            style={styles.miloImage}
            resizeMode="contain"
          />
        </LinearGradient>

        <View style={styles.textCard}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.message}>{item.message}</Text>
        </View>
      </View>
    );
  };

  return (
    <ScreenContainer scroll={false} padded={false} topPadding={0} bottomPadding={0}>
      <View style={styles.topBar}>
        <Text style={styles.brand}>FocusMate</Text>

        {!isLastSlide ? (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={onFinish}
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding"
          >
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        ref={listRef}
        data={slides}
        keyExtractor={(item) => item.id}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        bounces={false}
      />

      <View style={styles.footer}>
        <View style={styles.dotsRow}>
          {slides.map((slide, index) => (
            <View
              key={slide.id}
              style={[
                styles.dot,
                activeIndex === index && styles.activeDot,
              ]}
            />
          ))}
        </View>

        <AppButton
          title={isLastSlide ? 'Start using FocusMate' : 'Next'}
          onPress={handleNext}
          icon={
            <Ionicons
              name={isLastSlide ? 'checkmark-circle' : 'arrow-forward'}
              size={18}
              color="#FFFFFF"
            />
          }
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  topBar: {
    paddingTop: 58,
    paddingHorizontal: 22,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  brand: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.7,
  },
  skipText: {
    color: theme.colors.primaryDark,
    fontSize: 14,
    fontWeight: '900',
  },
  slide: {
    paddingHorizontal: 22,
    justifyContent: 'center',
  },
  heroCard: {
    height: 360,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...theme.shadow,
  },
  softShape: {
    position: 'absolute',
    right: -50,
    bottom: -45,
    width: 260,
    height: 180,
    borderRadius: 110,
    backgroundColor: 'rgba(85, 200, 120, 0.14)',
  },
  labelPill: {
    position: 'absolute',
    top: 20,
    left: 20,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 13,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    ...theme.shadowSoft,
  },
  labelText: {
    marginLeft: 7,
    color: theme.colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
  },
  miloImage: {
    width: 270,
    height: 270,
    marginTop: 18,
  },
  textCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 20,
    marginTop: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  title: {
    color: theme.colors.text,
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  message: {
    marginTop: 10,
    color: theme.colors.textSoft,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 22,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 22,
    paddingBottom: 34,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 18,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D6DEE8',
    marginHorizontal: 4,
  },
  activeDot: {
    width: 24,
    backgroundColor: theme.colors.primary,
  },
});
