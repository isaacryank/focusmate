import { Task } from '../types/task';
import { ResourceSourceType } from './resourceFinderStorage';

type ResourceFinderTask = Pick<
  Task,
  'id' | 'title' | 'description' | 'plannerType' | 'location'
>;

export type SmartResourceSuggestion = {
  id: string;
  title: string;
  description: string;
  category: string;
  reason: string;
  url: string;
  sourceType: ResourceSourceType;
  taskId: string;
  taskTitle: string;
  taskTypeSnapshot: Task['plannerType'];
};

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'can',
  'for',
  'from',
  'i',
  'in',
  'into',
  'is',
  'it',
  'my',
  'of',
  'on',
  'or',
  'our',
  'the',
  'their',
  'this',
  'to',
  'up',
  'we',
  'with',
  'you',
  'your',
]);

const WEAK_SEARCH_TERMS = new Set([
  'high',
  'low',
  'medium',
  'priority',
  'task',
]);

const ACADEMIC_CONTEXT_TERMS = new Set([
  'assignment',
  'documentation',
  'homework',
  'lab',
  'literature',
  'presentation',
  'project',
  'proposal',
  'report',
  'research',
  'revision',
]);

const MEETING_WORK_CONTEXT_TERMS = new Set([
  'client',
  'discussion',
  'meeting',
  'minutes',
  'office',
  'work',
]);

const PERSONAL_CONTEXT_TERMS = new Set([
  'birthday',
  'dad',
  'date',
  'dinner',
  'event',
  'family',
  'mom',
  'party',
]);

const ACADEMIC_HELPER_WORDS = ['tutorial', 'reference', 'guide'];
const MEETING_WORK_HELPER_WORDS = [
  'agenda',
  'notes',
  'preparation',
  'template',
];
const PERSONAL_HELPER_WORDS = ['ideas', 'checklist', 'planning'];
const GENERAL_HELPER_WORDS = ['guide', 'checklist', 'tips'];

function tokenize(value?: string, limit?: number) {
  const words = (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(
      (word) =>
        word.length > 1 &&
        !STOP_WORDS.has(word) &&
        !WEAK_SEARCH_TERMS.has(word)
    );

  return typeof limit === 'number' ? words.slice(0, limit) : words;
}

function getResourceHelperWords(keywords: string[]) {
  if (keywords.some((keyword) => ACADEMIC_CONTEXT_TERMS.has(keyword))) {
    return ACADEMIC_HELPER_WORDS;
  }

  if (keywords.some((keyword) => MEETING_WORK_CONTEXT_TERMS.has(keyword))) {
    return MEETING_WORK_HELPER_WORDS;
  }

  if (keywords.some((keyword) => PERSONAL_CONTEXT_TERMS.has(keyword))) {
    return PERSONAL_HELPER_WORDS;
  }

  if (keywords.length > 0) {
    return GENERAL_HELPER_WORDS;
  }

  return [];
}

function addUniqueKeyword(
  keywords: string[],
  seenKeywords: Set<string>,
  keyword?: string
) {
  const normalizedKeyword = keyword?.trim().toLowerCase();

  if (
    !normalizedKeyword ||
    seenKeywords.has(normalizedKeyword) ||
    WEAK_SEARCH_TERMS.has(normalizedKeyword)
  ) {
    return;
  }

  seenKeywords.add(normalizedKeyword);
  keywords.push(normalizedKeyword);
}

export function generateResourceKeywords(task: ResourceFinderTask): string[] {
  const keywords: string[] = [];
  const seenKeywords = new Set<string>();

  tokenize(task.title).forEach((word) =>
    addUniqueKeyword(keywords, seenKeywords, word)
  );
  tokenize(task.description, 10).forEach((word) =>
    addUniqueKeyword(keywords, seenKeywords, word)
  );

  return keywords;
}

export function buildResourceSearchQuery(
  keywordsOrTask: string[] | ResourceFinderTask
): string {
  const rawKeywords = Array.isArray(keywordsOrTask)
    ? keywordsOrTask
    : generateResourceKeywords(keywordsOrTask);
  const keywords: string[] = [];
  const seenKeywords = new Set<string>();

  rawKeywords.forEach((keyword) =>
    addUniqueKeyword(keywords, seenKeywords, keyword)
  );
  getResourceHelperWords(keywords).forEach((keyword) =>
    addUniqueKeyword(keywords, seenKeywords, keyword)
  );

  return keywords.join(' ').trim();
}

export function buildGoogleSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export function buildYouTubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

export function buildGoogleScholarUrl(query: string): string {
  return `https://scholar.google.com/scholar?q=${encodeURIComponent(query)}`;
}

export function buildGoogleMapsUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function includesKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function isProgrammingRelated(text: string) {
  return includesKeyword(text, [
    'api',
    'app',
    'bug',
    'code',
    'coding',
    'database',
    'expo',
    'github',
    'javascript',
    'program',
    'react',
    'software',
    'typescript',
  ]);
}

function isStudyRelated(text: string) {
  return includesKeyword(text, [
    'assignment',
    'exam',
    'homework',
    'lab',
    'lecture',
    'paper',
    'proposal',
    'research',
    'revision',
    'study',
  ]);
}

function getCategory(task: ResourceFinderTask, text: string) {
  if (task.plannerType === 'meeting') return 'Preparation';
  if (task.plannerType === 'date') return 'Plan Checklist';
  if (isProgrammingRelated(text)) return 'Coding';
  if (isStudyRelated(text)) return 'Study';
  return 'Productivity';
}

function makeSuggestion(
  task: ResourceFinderTask,
  suffix: string,
  input: Omit<SmartResourceSuggestion, 'id' | 'taskId' | 'taskTitle' | 'taskTypeSnapshot'>
): SmartResourceSuggestion {
  return {
    id: `${task.id}-${suffix}`,
    taskId: task.id,
    taskTitle: task.title,
    taskTypeSnapshot: task.plannerType,
    ...input,
  };
}

export function generateSmartResourceSuggestions(
  task: ResourceFinderTask
): SmartResourceSuggestion[] {
  const query = buildResourceSearchQuery(task) || task.title;
  const normalizedText = `${task.title} ${task.description || ''} ${
    task.location || ''
  }`.toLowerCase();
  const category = getCategory(task, normalizedText);
  const suggestions: SmartResourceSuggestion[] = [
    makeSuggestion(task, 'search', {
      title: `${task.title} search pack`,
      description: `Search the web for guides, examples, and references related to "${task.title}".`,
      category,
      reason: 'Milo starts broad so you can quickly spot the most useful source.',
      url: buildGoogleSearchUrl(query),
      sourceType: 'Search',
    }),
    makeSuggestion(task, 'youtube', {
      title: 'YouTube walkthroughs',
      description: 'Find visual explanations or quick tutorials for this planner item.',
      category: task.plannerType === 'meeting' ? 'Preparation' : category,
      reason: 'Videos can turn a fuzzy next step into something easier to start.',
      url: buildYouTubeSearchUrl(query),
      sourceType: 'YouTube',
    }),
    makeSuggestion(task, 'checklist', {
      title:
        task.plannerType === 'meeting'
          ? 'Meeting prep checklist'
          : task.plannerType === 'date'
          ? 'Date plan checklist'
          : 'Task prep checklist',
      description:
        task.plannerType === 'meeting'
          ? 'Agenda, notes, questions, link, and follow-up reminders.'
          : task.plannerType === 'date'
          ? 'Place, travel time, booking, gift or items, and final reminder.'
          : 'Break the work into materials, first step, focus block, review, and finish.',
      category:
        task.plannerType === 'meeting'
          ? 'Agenda'
          : task.plannerType === 'date'
          ? 'Plan Checklist'
          : 'Checklist',
      reason: 'Milo likes checklists because they lower the starting friction.',
      url: buildGoogleSearchUrl(`${query} checklist template`),
      sourceType: 'Checklist',
    }),
  ];

  if (isStudyRelated(normalizedText)) {
    suggestions.push(
      makeSuggestion(task, 'scholar', {
        title: 'Google Scholar references',
        description: 'Look for papers, citations, and academic background.',
        category: 'Research',
        reason: 'This looks study-related, so scholarly references may help.',
        url: buildGoogleScholarUrl(query),
        sourceType: 'Scholar',
      })
    );
  }

  if (isProgrammingRelated(normalizedText)) {
    suggestions.push(
      makeSuggestion(task, 'docs', {
        title: 'Official docs search',
        description: 'Search official docs and examples before using random snippets.',
        category: 'Coding',
        reason: 'This looks technical, so Milo puts documentation near the top.',
        url: buildGoogleSearchUrl(`${query} official documentation`),
        sourceType: 'Docs',
      })
    );
  }

  if (task.plannerType === 'meeting' || task.plannerType === 'date') {
    const placeQuery = task.location?.trim() || task.title;

    suggestions.push(
      makeSuggestion(task, 'maps', {
        title: task.location ? 'Maps and route prep' : 'Venue ideas and maps',
        description: task.location
          ? `Open map search for ${task.location}.`
          : 'Search map results for a suitable place or venue.',
        category: task.plannerType === 'date' ? 'Travel/Maps' : 'Location',
        reason: 'For meetings and dates, travel context matters as much as the reminder.',
        url: buildGoogleMapsUrl(placeQuery),
        sourceType: 'Map',
      })
    );
  }

  return suggestions.slice(0, 5);
}
