import AsyncStorage from '@react-native-async-storage/async-storage';

import { generateMiloSmartNudges } from './miloSmartPlan';
import type { Task } from '../types/task';

const MILO_TASK_PLAN_STORAGE_KEY = '@focusmate/milo-task-plans/v1';

export type MiloTaskPlanSource = 'ai' | 'local';

export type MiloTaskPlanStepStatus = 'todo' | 'in_progress' | 'done';

export type MiloTaskPlanStep = {
  id: string;
  label: string;
  detail?: string | null;
  status: MiloTaskPlanStepStatus;
};

export type MiloTaskPlanNudge = {
  id: string;
  title: string;
  message: string;
  timingLabel?: string | null;
};

export type MiloTaskPlanTimelineItem = {
  id: string;
  label: string;
  detail?: string | null;
  statusLabel?: string | null;
};

export type MiloTaskPlanInsight = {
  title: string;
  message: string;
  chips?: string[];
};

export type MiloTaskPlan = {
  taskId: string;
  generatedAt: string;
  source: MiloTaskPlanSource;
  plan: {
    title: string;
    steps: MiloTaskPlanStep[];
  };
  nudges: MiloTaskPlanNudge[];
  timeline: MiloTaskPlanTimelineItem[];
  insight: MiloTaskPlanInsight;
};

type LocalTaskPlanOptions = {
  hasMeetingLink?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function trimText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  return trimmed.length > maxLength
    ? `${trimmed.slice(0, maxLength - 1)}...`
    : trimmed;
}

function normalizeStepStatus(
  value: unknown,
  index: number
): MiloTaskPlanStepStatus {
  if (value === 'done' || value === 'todo' || value === 'in_progress') {
    return value;
  }

  return index === 0 ? 'in_progress' : 'todo';
}

function sanitizeTaskPlan(value: unknown, taskId?: string): MiloTaskPlan | null {
  if (!isRecord(value)) {
    return null;
  }

  const resolvedTaskId = trimText(value.taskId, 120) || taskId;

  if (!resolvedTaskId) {
    return null;
  }

  const plan: Record<string, unknown> = isRecord(value.plan) ? value.plan : {};
  const rawSteps = Array.isArray(plan.steps) ? plan.steps : [];
  const steps = rawSteps
    .map((rawStep, index): MiloTaskPlanStep | null => {
      if (!isRecord(rawStep)) {
        return null;
      }

      const label = trimText(rawStep.label, 180);

      if (!label) {
        return null;
      }

      return {
        id:
          trimText(rawStep.id, 120) ||
          `${resolvedTaskId}-task-plan-step-${index + 1}`,
        label,
        detail: trimText(rawStep.detail, 240) || null,
        status: normalizeStepStatus(rawStep.status, index),
      };
    })
    .filter((step): step is MiloTaskPlanStep => Boolean(step))
    .slice(0, 10);

  if (steps.length === 0) {
    return null;
  }

  const rawNudges = Array.isArray(value.nudges) ? value.nudges : [];
  const nudges = rawNudges
    .map((rawNudge, index): MiloTaskPlanNudge | null => {
      if (!isRecord(rawNudge)) {
        return null;
      }

      const title = trimText(rawNudge.title, 80);
      const message = trimText(rawNudge.message, 220);

      if (!title || !message) {
        return null;
      }

      return {
        id:
          trimText(rawNudge.id, 120) ||
          `${resolvedTaskId}-task-plan-nudge-${index + 1}`,
        title,
        message,
        timingLabel: trimText(rawNudge.timingLabel, 80) || null,
      };
    })
    .filter((nudge): nudge is MiloTaskPlanNudge => Boolean(nudge))
    .slice(0, 6);

  const rawTimeline = Array.isArray(value.timeline) ? value.timeline : [];
  const timeline = rawTimeline
    .map((rawTimelineItem, index): MiloTaskPlanTimelineItem | null => {
      if (!isRecord(rawTimelineItem)) {
        return null;
      }

      const label = trimText(rawTimelineItem.label, 120);

      if (!label) {
        return null;
      }

      return {
        id:
          trimText(rawTimelineItem.id, 120) ||
          `${resolvedTaskId}-task-plan-timeline-${index + 1}`,
        label,
        detail: trimText(rawTimelineItem.detail, 180) || null,
        statusLabel: trimText(rawTimelineItem.statusLabel, 40) || null,
      };
    })
    .filter((item): item is MiloTaskPlanTimelineItem => Boolean(item))
    .slice(0, 8);

  const insight: Record<string, unknown> = isRecord(value.insight)
    ? value.insight
    : {};
  const chips = Array.isArray(insight.chips)
    ? insight.chips
        .map((chip) => trimText(chip, 40))
        .filter((chip): chip is string => Boolean(chip))
        .slice(0, 4)
    : [];

  return {
    taskId: resolvedTaskId,
    generatedAt:
      trimText(value.generatedAt, 40) || new Date().toISOString(),
    source: value.source === 'ai' ? 'ai' : 'local',
    plan: {
      title: trimText(plan.title, 100) || 'Milo Smart Plan',
      steps,
    },
    nudges,
    timeline,
    insight: {
      title: trimText(insight.title, 100) || 'Milo Insight',
      message:
        trimText(insight.message, 260) || 'Small steps, big results.',
      chips:
        chips.length > 0
          ? chips
          : ['Break task down', 'Prep early', 'Check-in tomorrow'],
    },
  };
}

async function loadStoredTaskPlans() {
  try {
    const storedPlans = await AsyncStorage.getItem(MILO_TASK_PLAN_STORAGE_KEY);

    if (!storedPlans) {
      return {};
    }

    const parsedPlans = JSON.parse(storedPlans);

    if (!isRecord(parsedPlans)) {
      return {};
    }

    return Object.entries(parsedPlans).reduce<Record<string, MiloTaskPlan>>(
      (plans, [taskId, plan]) => {
        const sanitizedPlan = sanitizeTaskPlan(plan, taskId);

        if (sanitizedPlan) {
          plans[taskId] = sanitizedPlan;
        }

        return plans;
      },
      {}
    );
  } catch (error) {
    console.warn('Failed to load Milo task plans:', error);
    return {};
  }
}

async function saveStoredTaskPlans(plans: Record<string, MiloTaskPlan>) {
  await AsyncStorage.setItem(
    MILO_TASK_PLAN_STORAGE_KEY,
    JSON.stringify(plans)
  );
}

export async function loadMiloTaskPlan(taskId: string) {
  const plans = await loadStoredTaskPlans();
  return plans[taskId] || null;
}

export async function saveMiloTaskPlan(
  taskId: string,
  plan: MiloTaskPlan
) {
  const plans = await loadStoredTaskPlans();
  const sanitizedPlan = sanitizeTaskPlan(
    {
      ...plan,
      taskId,
    },
    taskId
  );

  if (!sanitizedPlan) {
    throw new Error('Invalid Milo task plan');
  }

  plans[taskId] = sanitizedPlan;
  await saveStoredTaskPlans(plans);

  return sanitizedPlan;
}

export async function clearMiloTaskPlan(taskId: string) {
  const plans = await loadStoredTaskPlans();

  if (!plans[taskId]) {
    return;
  }

  delete plans[taskId];
  await saveStoredTaskPlans(plans);
}

function getTaskKind(task: Task) {
  if (task.plannerType === 'meeting') {
    return 'meeting';
  }

  if (task.plannerType === 'date') {
    return 'date';
  }

  return 'task';
}

function getFallbackSteps(task: Task, options?: LocalTaskPlanOptions) {
  const hasLocation = Boolean(task.location?.trim());
  const hasMeetingLink = Boolean(options?.hasMeetingLink);

  if (task.plannerType === 'meeting') {
    return [
      'Review meeting details',
      'Prepare notes or questions',
      hasMeetingLink ? 'Check meeting link or platform' : 'Confirm meeting link or place',
      'Test audio and device',
      hasLocation ? 'Open location early' : 'Join a few minutes early',
    ];
  }

  if (task.plannerType === 'date') {
    return [
      'Confirm time and location',
      'Prepare items needed',
      hasLocation ? 'Check maps and route' : 'Check travel plan',
      'Leave with buffer time',
      'Set a quick reminder',
    ];
  }

  return [
    'Break task into small steps',
    'Start with the easiest step',
    'Do a 25-minute focus sprint',
    'Review progress',
    task.status === 'completed' ? 'Celebrate the finished work' : 'Mark done when finished',
  ];
}

function getFallbackTimeline(task: Task, steps: string[]) {
  const dueLabel = [task.dueDate, task.dueTime].filter(Boolean).join(' ');

  return steps.slice(0, 5).map((step, index) => ({
    id: `${task.id}-local-timeline-${index + 1}`,
    label: step,
    detail:
      index === 0
        ? 'Start here'
        : dueLabel
        ? `Before ${dueLabel}`
        : 'When ready',
    statusLabel: index === 0 ? 'Next' : 'Upcoming',
  }));
}

function getFallbackInsight(task: Task) {
  const kind = getTaskKind(task);

  if (kind === 'meeting') {
    return {
      title: 'Milo Meeting Insight',
      message:
        'A calm meeting starts with notes, a checked link or place, and one clear question.',
      chips: ['Prepare notes', 'Check link', 'Join early'],
    };
  }

  if (kind === 'date') {
    return {
      title: 'Milo Date Insight',
      message:
        'A little prep now keeps the date or event feeling easier when it is time to go.',
      chips: ['Check maps', 'Prep items', 'Leave early'],
    };
  }

  return {
    title: 'Milo Insight',
    message: 'Small steps, big results.',
    chips: ['Break task down', 'Prep early', 'Check-in tomorrow'],
  };
}

export function createLocalTaskPlan(
  task: Task,
  options?: LocalTaskPlanOptions
): MiloTaskPlan {
  const generatedAt = new Date().toISOString();
  const fallbackSteps = getFallbackSteps(task, options);
  const stepLabels = fallbackSteps;
  const nudges = generateMiloSmartNudges(task);

  return {
    taskId: task.id,
    generatedAt,
    source: 'local',
    plan: {
      title:
        task.plannerType === 'meeting'
          ? 'Milo Meeting Prep Plan'
          : task.plannerType === 'date'
          ? 'Milo Date Prep Plan'
          : 'Milo Smart Plan',
      steps: stepLabels.slice(0, 6).map((label, index) => ({
        id: `${task.id}-local-step-${index + 1}`,
        label,
        detail:
          index === 0
            ? 'Start with this tiny move.'
            : 'Keep it small and practical.',
        status: index === 0 ? 'in_progress' : 'todo',
      })),
    },
    nudges: nudges.slice(0, 4).map((nudge, index) => ({
      id: `${task.id}-local-nudge-${index + 1}`,
      title: nudge.label,
      message: nudge.message,
      timingLabel: nudge.timing,
    })),
    timeline: getFallbackTimeline(task, stepLabels),
    insight: getFallbackInsight(task),
  };
}
