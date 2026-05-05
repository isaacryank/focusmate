import React from 'react';
import {
  Image,
  ImageSourcePropType,
  ImageStyle,
  StyleProp,
} from 'react-native';

import { MiloMood } from '../../lib/miloPersonality';

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
  return (
    <Image
      source={miloImages[mood]}
      resizeMode="contain"
      style={[
        {
          width: size,
          height: size,
        },
        style,
      ]}
    />
  );
}