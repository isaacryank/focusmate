import { Task } from '../types/task';

export function generateMiloPlan(task: Task): string[] {
  const title = task.title.toLowerCase();

  if (task.plannerType === 'meeting') {
    return [
      'Review the meeting topic before the session.',
      'Write down 2 or 3 questions you want to ask.',
      'Prepare any files, notes, or documents needed.',
      'Set a reminder before the meeting time.',
      'After the meeting, update your task list with next actions.',
    ];
  }

  if (task.plannerType === 'date') {
    return [
      'Confirm the date, time, and location.',
      'Prepare anything you need before going.',
      'Leave early enough to avoid being late.',
      'Set a reminder so you do not miss it.',
      'After the event, mark this item as completed.',
    ];
  }

  if (
    title.includes('fyp') ||
    title.includes('proposal') ||
    title.includes('chapter') ||
    title.includes('assignment')
  ) {
    return [
      'Understand the requirement clearly.',
      'Collect references or notes related to the topic.',
      'Create a simple outline before writing.',
      'Complete the first draft without worrying too much.',
      'Review, improve, and submit before the deadline.',
    ];
  }

  if (task.priority === 'high') {
    return [
      'Identify the most urgent part of this task.',
      'Break the task into 3 smaller actions.',
      'Start with the easiest first step.',
      'Focus for 25 minutes without distractions.',
      'Review your progress and continue the next step.',
    ];
  }

  return [
    'Clarify what needs to be done.',
    'Break the task into small steps.',
    'Pick one step to start with now.',
    'Set a realistic time to complete it.',
    'Mark it complete when finished.',
  ];
}