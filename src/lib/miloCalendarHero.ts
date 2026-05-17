import { ImageSourcePropType } from 'react-native';

import { miloActivities, miloReactions } from '../assets/generatedAssetMap';
import { Task } from '../types/task';
import { isActiveWarningCandidate } from './miloSituationIntelligence';
import { getTaskUrgency } from './taskUrgency';

export type MiloCalendarHero = {
  moodLabel: string;
  headline: string;
  line1: string;
  line2: string;
  miloAsset: ImageSourcePropType;
};

export function getMiloCalendarHero(items: Task[]): MiloCalendarHero {
  const pendingItems = items.filter((item) => item.status !== 'completed');
  const completedItems = items.filter((item) => item.status === 'completed');
  const urgentItems = pendingItems.filter((item) =>
    isActiveWarningCandidate(item) &&
    ['overdue', 'urgent', 'high'].includes(getTaskUrgency(item).level)
  );

  if (items.length > 0 && completedItems.length === items.length) {
    return {
      moodLabel: 'Proud Milo',
      headline: 'You wrapped up\nthis date.',
      line1: `${completedItems.length} item${completedItems.length === 1 ? '' : 's'} done,`,
      line2: 'Milo is proud of you.',
      miloAsset: miloReactions.proud,
    };
  }

  if (urgentItems.length > 0) {
    return {
      moodLabel: 'Worried Milo',
      headline: "Let's handle\nthis gently",
      line1: 'Something needs attention,',
      line2: 'Milo is here with you.',
      miloAsset: miloReactions.worried,
    };
  }

  if (items.length > 0) {
    const meetings = pendingItems.filter((item) => item.plannerType === 'meeting').length;
    const tasks = pendingItems.filter((item) => item.plannerType === 'task').length;
    const dates = pendingItems.filter((item) => item.plannerType === 'date').length;
    const laterCount = tasks + dates;

    return {
      moodLabel: 'Focused Milo',
      headline: 'Milo is watching\nthis date.',
      line1: `${meetings} meeting${meetings === 1 ? '' : 's'} soon,`,
      line2: `${laterCount} task${laterCount === 1 ? '' : 's'} later.`,
      miloAsset: meetings > 0 ? miloActivities.online_meeting : miloActivities.holding_calendar,
    };
  }

  return {
    moodLabel: 'Calm Milo',
    headline: 'A quiet\nlittle day',
    line1: 'Nothing planned yet,',
    line2: "add something when you're ready.",
    miloAsset: miloReactions.calm_meditating,
  };
}
