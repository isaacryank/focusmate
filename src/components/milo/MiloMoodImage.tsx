import React from 'react';
import {
  Animated,
  ImageSourcePropType,
  ImageStyle,
  StyleProp,
} from 'react-native';

import { MiloMood } from '../../lib/miloPersonality';
import { useFocusMateTheme } from '../../theme/FocusMateThemeProvider';

const miloImages: Record<MiloMood, ImageSourcePropType> = {
  idle: require('../../../assets/mascot/milo_idle.png'),
  happy: require('../../../assets/mascot/milo_happy.png'),
  focused: require('../../../assets/mascot/milo_focused.png'),
  worried: require('../../../assets/mascot/milo_worried.png'),
  waving: require('../../../assets/mascot/milo_waving.png'),
  sleepy: require('../../../assets/mascot/milo_sleepy.png'),
  celebrating: require('../../../assets/mascot/milo_celebrating.png'),
};

export function getMiloImageSource(mood: MiloMood) {
  return miloImages[mood];
}

export default function MiloMoodImage({
  mood,
  size = 130,
  style,
}: {
  mood: MiloMood;
  size?: number;
  style?: StyleProp<ImageStyle>;
}) {
  useFocusMateTheme();

  const motion = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    motion.setValue(0);

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(motion, {
          toValue: 1,
          duration:
            mood === 'worried'
              ? 110
              : mood === 'celebrating'
              ? 260
              : mood === 'focused'
              ? 950
              : 1600,
          useNativeDriver: true,
        }),
        Animated.timing(motion, {
          toValue: 0,
          duration:
            mood === 'worried'
              ? 110
              : mood === 'celebrating'
              ? 360
              : mood === 'focused'
              ? 950
              : 1600,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => animation.stop();
  }, [mood, motion]);

  const animatedStyle = {
    transform:
      mood === 'worried'
        ? [
            {
              translateX: motion.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [-1.5, 1.5, -1.5],
              }),
            },
          ]
        : mood === 'celebrating'
        ? [
            {
              translateY: motion.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0, -7, 0],
              }),
            },
          ]
        : mood === 'focused'
        ? [
            {
              translateY: motion.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -3],
              }),
            },
          ]
        : [
            {
              scale: motion.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.025],
              }),
            },
          ],
  };

  return (
    <Animated.Image
      source={miloImages[mood]}
      resizeMode="contain"
      style={[
        {
          width: size,
          height: size,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}
