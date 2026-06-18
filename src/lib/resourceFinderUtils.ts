import { Task } from '../types/task';

type ResourceFinderTask = Pick<
  Task,
  'title' | 'description'
>;

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
