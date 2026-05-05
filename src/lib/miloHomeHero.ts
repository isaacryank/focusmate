import { ImageSourcePropType } from 'react-native';

import { miloActivities, miloReactions } from '../assets/generatedAssetMap';
import { theme } from '../theme';

export type MiloHomeHeroMood =
  | 'worried'
  | 'focused'
  | 'ready'
  | 'helpful'
  | 'proud'
  | 'sleepy'
  | 'happy';

export type MiloHomeHeroInput = {
  displayName: string;
  tasksToday: number;
  meetingsToday: number;
  datesToday: number;
  doneToday: number;
  totalToday: number;
  overdue: number;
  dueToday: number;
  startEarly: number;
  meetingSoon: number;
  now?: Date;
};

export type MiloHomeHero = {
  moodLabel: string;
  headline: string;
  messageLine1: string;
  messageLine2: string;
  primaryActionLabel: string;
  secondaryActionLabel: string;
  miloAsset: ImageSourcePropType;
  heroTint: string;
  moodType: MiloHomeHeroMood;
};

function countPhrase(value: number, singular: string, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
}

export function getMiloHomeHero(input: MiloHomeHeroInput): MiloHomeHero {
  const now = input.now ?? new Date();
  const hour = now.getHours();
  const isNight = hour >= 21 || hour < 5;
  const actions = {
    primaryActionLabel: 'View Today',
    secondaryActionLabel: 'Ask Milo',
  };

  if (input.overdue > 0) {
    return {
      ...actions,
      moodLabel: 'Worried Milo',
      headline: "Let's recover calmly",
      messageLine1: `${countPhrase(input.overdue, 'item')} ${
        input.overdue === 1 ? 'needs' : 'need'
      } attention,`,
      messageLine2: 'small steps still count.',
      miloAsset: miloReactions.worried,
      heroTint: theme.colors.dangerSoft,
      moodType: 'worried',
    };
  }

  if (input.meetingSoon > 0) {
    return {
      ...actions,
      moodLabel: 'Ready Milo',
      headline: 'Meeting coming up',
      messageLine1: "Let's get ready,",
      messageLine2: 'Milo saved you a seat.',
      miloAsset: miloActivities.online_meeting,
      heroTint: theme.colors.purpleSoft,
      moodType: 'ready',
    };
  }

  if (input.dueToday > 0) {
    return {
      ...actions,
      moodLabel: 'Focused Milo',
      headline: "Let's lock in today",
      messageLine1: 'A few things need focus,',
      messageLine2: 'Milo is staying with you.',
      miloAsset: miloReactions.determined_lock_in,
      heroTint: '#E3F8EA',
      moodType: 'focused',
    };
  }

  if (input.startEarly > 0) {
    return {
      ...actions,
      moodLabel: 'Helpful Milo',
      headline: 'Good time to start',
      messageLine1: 'No rush yet,',
      messageLine2: 'future-you will thank you.',
      miloAsset: miloActivities.checklist_clipboard,
      heroTint: theme.colors.primarySoft,
      moodType: 'helpful',
    };
  }

  if (input.totalToday > 0 && input.doneToday === input.totalToday) {
    return {
      ...actions,
      moodLabel: 'Proud Milo',
      headline: 'You did it!',
      messageLine1: "Today's plan is complete,",
      messageLine2: 'Milo is proud of you.',
      miloAsset: miloReactions.proud,
      heroTint: theme.colors.blueSoft,
      moodType: 'proud',
    };
  }

  if (isNight) {
    return {
      ...actions,
      moodLabel: 'Sleepy Milo',
      headline: 'Time to slow down',
      messageLine1: 'Your plan is safe,',
      messageLine2: 'Milo says rest matters too.',
      miloAsset: miloReactions.sleepy,
      heroTint: '#EEF7F2',
      moodType: 'sleepy',
    };
  }

  return {
    ...actions,
    moodLabel: 'Happy Milo',
    headline: 'Good time to start',
    messageLine1: 'No rush yet,',
    messageLine2: 'future-you will thank you.',
    miloAsset: miloReactions.happy,
    heroTint: '#DDF6E7',
    moodType: 'happy',
  };
}
