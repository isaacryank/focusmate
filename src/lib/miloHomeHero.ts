import { ImageSourcePropType } from 'react-native';

import { miloActivities, miloReactions } from '../assets/generatedAssetMap';
import { theme } from '../theme';
import type {
  MiloHomeSituation,
  MiloSituationKind,
} from './miloSituationIntelligence';

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
  smartSituation?: MiloHomeSituation;
  packedDay?: boolean;
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

function isPackedDayHero(kind: MiloSituationKind) {
  return [
    'due_today',
    'due_tonight',
    'high_focus',
    'start_early',
    'upcoming',
    'calm',
  ].includes(kind);
}

function getSmartSituationHero(
  situation: MiloHomeSituation,
  packedDay: boolean
): Omit<MiloHomeHero, 'primaryActionLabel' | 'secondaryActionLabel'> | null {
  if (packedDay && isPackedDayHero(situation.kind)) {
    return {
      moodLabel: 'Caring Milo',
      headline: 'Pace your day',
      messageLine1: 'Your day looks packed.',
      messageLine2: 'Take a short rest after one task.',
      miloAsset: miloReactions.worried,
      heroTint: theme.colors.yellowSoft,
      moodType: 'worried',
    };
  }

  switch (situation.kind) {
    case 'overdue':
      return {
        moodLabel: 'Worried Milo',
        headline: "Let's recover calmly",
        messageLine1: 'One thing is overdue,',
        messageLine2: 'but we can recover it gently.',
        miloAsset: miloReactions.worried,
        heroTint: theme.colors.dangerSoft,
        moodType: 'worried',
      };
    case 'missed':
      return {
        moodLabel: 'Caring Milo',
        headline: 'Small recovery step',
        messageLine1: 'This slipped a little.',
        messageLine2: 'Want to do it now or reschedule?',
        miloAsset: miloReactions.worried,
        heroTint: theme.colors.dangerSoft,
        moodType: 'worried',
      };
    case 'happening_now':
      return {
        moodLabel: 'Focused Milo',
        headline: 'Stay with this',
        messageLine1: 'This is happening now.',
        messageLine2: 'Stay focused.',
        miloAsset: miloReactions.determined_lock_in,
        heroTint: '#E3F8EA',
        moodType: 'focused',
      };
    case 'starting_soon':
      return {
        moodLabel: 'Ready Milo',
        headline: 'Starting soon',
        messageLine1: 'This starts soon.',
        messageLine2: "Let's get ready.",
        miloAsset: miloActivities.online_meeting,
        heroTint: theme.colors.purpleSoft,
        moodType: 'ready',
      };
    case 'accepted_overlap':
      return {
        moodLabel: 'Careful Milo',
        headline: 'Keep Both is on',
        messageLine1: 'You chose Keep Both.',
        messageLine2: "I'll remind you to stay focused.",
        miloAsset: miloReactions.determined_lock_in,
        heroTint: theme.colors.yellowSoft,
        moodType: 'focused',
      };
    case 'all_day':
      return {
        moodLabel: 'Ready Milo',
        headline: 'Part of today',
        messageLine1: 'This is part of your day,',
        messageLine2: 'not just one moment.',
        miloAsset: miloActivities.holding_calendar,
        heroTint: theme.colors.blueSoft,
        moodType: 'ready',
      };
    case 'due_today':
      return {
        moodLabel: 'Focused Milo',
        headline: "Today's focus",
        messageLine1: "Let's handle what",
        messageLine2: 'matters today.',
        miloAsset: miloReactions.determined_lock_in,
        heroTint: '#E3F8EA',
        moodType: 'focused',
      };
    case 'due_tonight':
      return {
        moodLabel: 'Helpful Milo',
        headline: 'Tonight still has room',
        messageLine1: 'You still have time,',
        messageLine2: "but don't leave it too late.",
        miloAsset: miloActivities.holding_calendar,
        heroTint: theme.colors.yellowSoft,
        moodType: 'helpful',
      };
    case 'high_focus':
      return {
        moodLabel: 'Focused Milo',
        headline: 'Stronger focus',
        messageLine1: 'This needs',
        messageLine2: 'stronger focus.',
        miloAsset: miloReactions.determined_lock_in,
        heroTint: '#E3F8EA',
        moodType: 'focused',
      };
    case 'start_early':
      return {
        moodLabel: 'Helpful Milo',
        headline: 'Start early',
        messageLine1: 'A small early step',
        messageLine2: 'can reduce stress later.',
        miloAsset: miloActivities.checklist_clipboard,
        heroTint: theme.colors.primarySoft,
        moodType: 'helpful',
      };
    case 'calm':
      return {
        moodLabel: 'Happy Milo',
        headline: 'Plan looks manageable',
        messageLine1: 'Your plan looks manageable',
        messageLine2: 'right now.',
        miloAsset: miloReactions.happy,
        heroTint: '#DDF6E7',
        moodType: 'happy',
      };
    default:
      return null;
  }
}

export function getMiloHomeHero(input: MiloHomeHeroInput): MiloHomeHero {
  const now = input.now ?? new Date();
  const hour = now.getHours();
  const isNight = hour >= 21 || hour < 5;
  const actions = {
    primaryActionLabel: 'View Today',
    secondaryActionLabel: 'Ask Milo',
  };

  if (input.smartSituation) {
    const smartHero = getSmartSituationHero(
      input.smartSituation,
      Boolean(input.packedDay)
    );

    if (smartHero) {
      return {
        ...actions,
        ...smartHero,
      };
    }
  }

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
