import { supabase } from './supabase';
import type { MiloAiSettings } from './miloAiSettings';
import { incrementMiloAiCallsToday } from './miloAiSettings';
import {
  createLocalTaskPlan,
  type MiloTaskPlan,
  type MiloTaskPlanInsight,
  type MiloTaskPlanNudge,
  type MiloTaskPlanStep,
  type MiloTaskPlanTimelineItem,
} from './miloTaskPlanStorage';
import type { Task } from '../types/task';

type GenerateMiloTaskSmartPlanInput = {
  task: Task;
  aiSettings: MiloAiSettings;
  relatedTasks?: Task[];
  hasMeetingLink?: boolean;
};

type MiloTaskPlanAiStep = {
  label?: unknown;
  detail?: unknown;
};

type MiloTaskPlanAiNudge = {
  title?: unknown;
  message?: unknown;
  timingLabel?: unknown;
};

type MiloTaskPlanAiTimelineItem = {
  label?: unknown;
  detail?: unknown;
  statusLabel?: unknown;
};

type MiloTaskPlanAiInsight = {
  title?: unknown;
  message?: unknown;
  chips?: unknown;
};

type MiloTaskPlanAiPayload = {
  title?: unknown;
  steps?: unknown;
  nudges?: unknown;
  timeline?: unknown;
  insight?: unknown;
};

type MiloTaskPlanAiResponse = {
  taskSmartPlan?: MiloTaskPlanAiPayload | null;
  usedAi?: boolean;
  debugReason?: string;
};

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

function buildCompactTaskContext(task: Task, hasMeetingLink?: boolean) {
  return {
    id: task.id,
    title: trimText(task.title, 120) || 'Untitled item',
    description: trimText(task.description, 260),
    type: task.plannerType,
    priority: task.priority,
    due_date: trimText(task.dueDate, 20),
    due_time: trimText(task.dueTime, 20),
    estimated_duration_minutes: task.estimatedDurationMinutes,
    completed: task.status === 'completed',
    location: trimText(task.location, 160),
    hasMeetingLink: Boolean(hasMeetingLink),
    hasResourceContext: Boolean(task.description?.trim()),
  };
}

function normalizeAiSteps(
  steps: unknown,
  fallbackPlan: MiloTaskPlan
): MiloTaskPlanStep[] {
  const aiSteps = Array.isArray(steps)
    ? steps
        .map((step, index): MiloTaskPlanStep | null => {
          if (!step || typeof step !== 'object' || Array.isArray(step)) {
            return null;
          }

          const rawStep = step as MiloTaskPlanAiStep;
          const label = trimText(rawStep.label, 140);

          if (!label) {
            return null;
          }

          return {
            id: `${fallbackPlan.taskId}-ai-step-${index + 1}`,
            label,
            detail: trimText(rawStep.detail, 220) || null,
            status: index === 0 ? 'in_progress' : 'todo',
          };
        })
        .filter((step): step is MiloTaskPlanStep => Boolean(step))
        .slice(0, 8)
    : [];

  return aiSteps.length > 0 ? aiSteps : fallbackPlan.plan.steps;
}

function normalizeAiNudges(
  nudges: unknown,
  fallbackPlan: MiloTaskPlan
): MiloTaskPlanNudge[] {
  const aiNudges = Array.isArray(nudges)
    ? nudges
        .map((nudge, index): MiloTaskPlanNudge | null => {
          if (!nudge || typeof nudge !== 'object' || Array.isArray(nudge)) {
            return null;
          }

          const rawNudge = nudge as MiloTaskPlanAiNudge;
          const title = trimText(rawNudge.title, 80);
          const message = trimText(rawNudge.message, 220);

          if (!title || !message) {
            return null;
          }

          return {
            id: `${fallbackPlan.taskId}-ai-nudge-${index + 1}`,
            title,
            message,
            timingLabel: trimText(rawNudge.timingLabel, 80) || null,
          };
        })
        .filter((nudge): nudge is MiloTaskPlanNudge => Boolean(nudge))
        .slice(0, 5)
    : [];

  return aiNudges.length > 0 ? aiNudges : fallbackPlan.nudges;
}

function normalizeAiTimeline(
  timeline: unknown,
  fallbackPlan: MiloTaskPlan
): MiloTaskPlanTimelineItem[] {
  const aiTimeline = Array.isArray(timeline)
    ? timeline
        .map((item, index): MiloTaskPlanTimelineItem | null => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) {
            return null;
          }

          const rawItem = item as MiloTaskPlanAiTimelineItem;
          const label = trimText(rawItem.label, 120);

          if (!label) {
            return null;
          }

          return {
            id: `${fallbackPlan.taskId}-ai-timeline-${index + 1}`,
            label,
            detail: trimText(rawItem.detail, 180) || null,
            statusLabel: trimText(rawItem.statusLabel, 40) || null,
          };
        })
        .filter(
          (item): item is MiloTaskPlanTimelineItem => Boolean(item)
        )
        .slice(0, 6)
    : [];

  return aiTimeline.length > 0 ? aiTimeline : fallbackPlan.timeline;
}

function normalizeAiInsight(
  insight: unknown,
  fallbackPlan: MiloTaskPlan
): MiloTaskPlanInsight {
  if (!insight || typeof insight !== 'object' || Array.isArray(insight)) {
    return fallbackPlan.insight;
  }

  const rawInsight = insight as MiloTaskPlanAiInsight;
  const title = trimText(rawInsight.title, 100);
  const message = trimText(rawInsight.message, 260);
  const chips = Array.isArray(rawInsight.chips)
    ? rawInsight.chips
        .map((chip) => trimText(chip, 40))
        .filter((chip): chip is string => Boolean(chip))
        .slice(0, 4)
    : [];

  return {
    title: title || fallbackPlan.insight.title,
    message: message || fallbackPlan.insight.message,
    chips: chips.length > 0 ? chips : fallbackPlan.insight.chips,
  };
}

function normalizeAiTaskPlan({
  rawPlan,
  task,
  hasMeetingLink,
}: {
  rawPlan: MiloTaskPlanAiPayload;
  task: Task;
  hasMeetingLink?: boolean;
}): MiloTaskPlan {
  const fallbackPlan = createLocalTaskPlan(task, { hasMeetingLink });
  const steps = normalizeAiSteps(rawPlan.steps, fallbackPlan);

  if (steps.length === 0) {
    throw new Error('Milo AI task plan did not include steps.');
  }

  return {
    taskId: task.id,
    generatedAt: new Date().toISOString(),
    source: 'ai',
    plan: {
      title: trimText(rawPlan.title, 100) || fallbackPlan.plan.title,
      steps,
    },
    nudges: normalizeAiNudges(rawPlan.nudges, fallbackPlan),
    timeline: normalizeAiTimeline(rawPlan.timeline, fallbackPlan),
    insight: normalizeAiInsight(rawPlan.insight, fallbackPlan),
  };
}

export async function generateMiloTaskSmartPlan({
  task,
  aiSettings,
  relatedTasks = [],
  hasMeetingLink,
}: GenerateMiloTaskSmartPlanInput): Promise<MiloTaskPlan> {
  if (aiSettings.aiMode === 'local') {
    return createLocalTaskPlan(task, { hasMeetingLink });
  }

  try {
    const compactTasks = [
      buildCompactTaskContext(task, hasMeetingLink),
      ...relatedTasks
        .filter((relatedTask) => relatedTask.id !== task.id)
        .slice(0, 8)
        .map((relatedTask) => buildCompactTaskContext(relatedTask)),
    ];

    const { data, error } =
      await supabase.functions.invoke<MiloTaskPlanAiResponse>('milo-chat', {
        body: {
          intent: 'task_detail_plan',
          taskId: task.id,
          message: `Generate a compact task detail smart plan for ${task.title}.`,
          tasks: compactTasks,
        },
      });

    if (error) {
      throw error;
    }

    if (!data?.usedAi || !data.taskSmartPlan) {
      throw new Error(
        data?.debugReason || 'Milo AI task plan used local fallback.'
      );
    }

    const normalizedPlan = normalizeAiTaskPlan({
      rawPlan: data.taskSmartPlan,
      task,
      hasMeetingLink,
    });

    await incrementMiloAiCallsToday();

    return normalizedPlan;
  } catch (error) {
    console.warn('Falling back to local Milo task plan:', error);
    return createLocalTaskPlan(task, { hasMeetingLink });
  }
}
