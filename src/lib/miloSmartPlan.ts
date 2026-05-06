import {
  MiloSmartNudge,
  MiloSmartPlanStep,
  MiloUrgencyLevel,
  PlannerType,
  ReminderOption,
  Task,
  TaskPriority,
} from '../types/task';
import { getDaysUntilDue } from './taskUrgency';

type SmartPlanInput = {
  title: string;
  description?: string;
  plannerType: PlannerType;
  priority: TaskPriority;
  dueDate?: string;
  dueTime?: string;
  location?: string;
  reminder?: ReminderOption;
  estimatedDurationMinutes?: number;
  status?: 'pending' | 'completed';
  subtasks?: Task['subtasks'];
};

type Situation = {
  id: string;
  label: string;
  keywords: string[];
  chips: string[];
  steps: string[];
  prepHeavy?: boolean;
};

const situations: Situation[] = [
  { id: 'assignment', label: 'Assignment', keywords: ['assignment', 'homework', 'coursework'], chips: ['Research', 'Outline', 'Work', 'Review', 'Submit'], steps: ['Check the requirements and marking guide.', 'Collect notes or references that fit the topic.', 'Make a short outline before doing the main work.', 'Finish a first version, then review it calmly.', 'Prepare the submission file before the deadline.'], prepHeavy: true },
  { id: 'lab-report', label: 'Lab report', keywords: ['lab report', 'experiment', 'practical report'], chips: ['Data', 'Method', 'Analysis', 'Write', 'Check'], steps: ['Gather the experiment data and instructions.', 'Write the method and results clearly.', 'Add analysis, tables, or screenshots if needed.', 'Check formatting and references.', 'Save a clean final copy.'], prepHeavy: true },
  { id: 'presentation', label: 'Presentation', keywords: ['presentation', 'slides', 'pitch'], chips: ['Key Points', 'Slides', 'Practice', 'Timing', 'Backup'], steps: ['Pick the main points Milo should help you remember.', 'Prepare simple slides or speaking notes.', 'Practice once and check the timing.', 'Prepare files, link, or adapter before the session.', 'Keep a backup copy ready.'], prepHeavy: true },
  { id: 'exam', label: 'Exam study', keywords: ['exam', 'final', 'midterm'], chips: ['Topics', 'Practice', 'Review', 'Rest', 'Arrive'], steps: ['List the topics that matter most.', 'Start with one practice question or past paper.', 'Review weak areas in a short session.', 'Prepare stationery, ID, and timing.', 'Leave space for rest before the exam.'], prepHeavy: true },
  { id: 'quiz', label: 'Quiz or test', keywords: ['quiz', 'test'], chips: ['Scope', 'Practice', 'Recap', 'Ready'], steps: ['Confirm the quiz scope.', 'Review the highest value notes first.', 'Try a few quick questions.', 'Set a short recap before the quiz.'], prepHeavy: true },
  { id: 'fyp', label: 'FYP task', keywords: ['fyp', 'thesis', 'final year project'], chips: ['Scope', 'Build', 'Evidence', 'Supervisor', 'Update'], steps: ['Clarify the exact FYP outcome for this item.', 'Break the work into one build or writing step.', 'Collect evidence, screenshots, or references as you go.', 'Prepare a short update for your supervisor.', 'Save progress in a clear folder.'], prepHeavy: true },
  { id: 'coding', label: 'Coding task', keywords: ['code', 'coding', 'bug', 'feature', 'typescript', 'react native', 'expo'], chips: ['Reproduce', 'Implement', 'Test', 'Polish'], steps: ['Clarify the expected behavior.', 'Find the file or screen that owns the change.', 'Make the smallest working update.', 'Run a quick check or test.', 'Review the screen flow before marking done.'], prepHeavy: true },
  { id: 'design', label: 'Design task', keywords: ['design', 'mockup', 'ui', 'ux', 'prototype', 'figma'], chips: ['Reference', 'Layout', 'States', 'Review'], steps: ['Collect the design reference or goal.', 'Sketch the main layout and information order.', 'Prepare states for empty, active, and done.', 'Check spacing, color, and readability.', 'Share or save the latest version.'], prepHeavy: true },
  { id: 'group-project', label: 'Group project', keywords: ['group project', 'team project'], chips: ['Roles', 'Work', 'Sync', 'Combine'], steps: ['Confirm everyone’s role and the shared deadline.', 'Pick your next small contribution.', 'Sync with the group before combining work.', 'Check the final file together.', 'Keep a backup of your part.'], prepHeavy: true },
  { id: 'reading', label: 'Reading task', keywords: ['read', 'reading', 'article', 'chapter'], chips: ['Skim', 'Notes', 'Summarize'], steps: ['Skim headings to understand the topic.', 'Read the key section first.', 'Write three useful notes.', 'Summarize what you need for later.'] },
  { id: 'essay-report', label: 'Essay or report', keywords: ['essay', 'report', 'write up', 'writing'], chips: ['Thesis', 'Outline', 'Draft', 'Cite', 'Polish'], steps: ['Write the main point in one sentence.', 'Create a simple section outline.', 'Draft one section without over-editing.', 'Add citations or supporting details.', 'Read once for clarity before submitting.'], prepHeavy: true },
  { id: 'submission', label: 'Document submission', keywords: ['submit', 'submission', 'form', 'document', 'upload'], chips: ['Requirements', 'Files', 'Check', 'Submit'], steps: ['Check the required files and format.', 'Prepare the final document names clearly.', 'Review details before upload.', 'Submit early enough to avoid rush.', 'Save proof or confirmation.'], prepHeavy: true },
  { id: 'clean-room', label: 'Clean room', keywords: ['clean room', 'tidy room', 'bedroom'], chips: ['Clear', 'Sort', 'Wipe', 'Reset'], steps: ['Clear visible clutter first.', 'Sort items into keep, wash, and throw.', 'Wipe the main surfaces.', 'Reset the space for tomorrow.'] },
  { id: 'clean-garden', label: 'Clean garden', keywords: ['garden', 'yard', 'grass', 'plants'], chips: ['Tools', 'Clear', 'Trim', 'Wash'], steps: ['Prepare gloves, bags, and tools.', 'Clear loose rubbish or leaves.', 'Trim or water the plants if needed.', 'Clean up tools before finishing.'] },
  { id: 'laundry', label: 'Laundry', keywords: ['laundry', 'wash clothes', 'dry clothes'], chips: ['Sort', 'Wash', 'Dry', 'Fold'], steps: ['Sort clothes by color or fabric.', 'Start the wash cycle.', 'Move clothes to dry on time.', 'Fold or hang the clean clothes.'] },
  { id: 'grocery', label: 'Groceries', keywords: ['grocery', 'groceries', 'market', 'supermarket'], chips: ['List', 'Budget', 'Route', 'Store'], steps: ['Check what you already have.', 'Make a short grocery list.', 'Plan the store or route.', 'Put cold items away first when you return.'] },
  { id: 'cooking', label: 'Cooking', keywords: ['cook', 'meal prep', 'dinner prep', 'lunch prep'], chips: ['Recipe', 'Ingredients', 'Prep', 'Cook'], steps: ['Choose the recipe or meal target.', 'Check ingredients before starting.', 'Prepare items that take longest first.', 'Clean as you go when possible.'] },
  { id: 'moving', label: 'Moving', keywords: ['moving', 'move room', 'move house', 'packing'], chips: ['Sort', 'Pack', 'Label', 'Move'], steps: ['Sort items by room or purpose.', 'Pack fragile or important items carefully.', 'Label bags or boxes clearly.', 'Keep essentials easy to reach.'], prepHeavy: true },
  { id: 'bill', label: 'Bill or payment', keywords: ['bill', 'payment', 'pay', 'invoice'], chips: ['Amount', 'Method', 'Pay', 'Proof'], steps: ['Confirm the amount and due date.', 'Choose the payment method.', 'Pay when you have a quiet moment.', 'Save the receipt or confirmation.'] },
  { id: 'renewal', label: 'Renewal', keywords: ['renew', 'subscription', 'license', 'licence'], chips: ['Check', 'Renew', 'Confirm'], steps: ['Check the renewal requirement.', 'Prepare account details or documents.', 'Complete the renewal.', 'Save the confirmation.'] },
  { id: 'doctor', label: 'Doctor appointment', keywords: ['doctor', 'clinic', 'hospital'], chips: ['Symptoms', 'Documents', 'Travel', 'Follow Up'], steps: ['Write symptoms or questions for the doctor.', 'Prepare IC, card, and appointment details.', 'Plan travel time to the clinic.', 'Note any follow-up actions after the visit.'], prepHeavy: true },
  { id: 'dentist', label: 'Dentist appointment', keywords: ['dentist', 'dental'], chips: ['Confirm', 'Travel', 'Questions'], steps: ['Confirm the appointment time.', 'Prepare any previous dental notes if needed.', 'Plan travel time.', 'Write down care advice after the visit.'] },
  { id: 'medicine', label: 'Medicine schedule', keywords: ['medicine', 'medication', 'pill', 'prescription'], chips: ['Dose', 'Time', 'Refill'], steps: ['Confirm the correct dose.', 'Set the medicine where you can see it safely.', 'Track when it is taken.', 'Check whether a refill is needed.'] },
  { id: 'workout', label: 'Workout', keywords: ['workout', 'gym', 'exercise', 'run', 'jog'], chips: ['Gear', 'Warm Up', 'Session', 'Recover'], steps: ['Prepare clothes, water, and shoes.', 'Warm up gently.', 'Do the planned session.', 'Cool down and record progress.'] },
  { id: 'sleep-rest', label: 'Sleep or rest', keywords: ['sleep', 'rest', 'nap'], chips: ['Wind Down', 'Alarm', 'Recharge'], steps: ['Set a realistic rest window.', 'Put distractions away if possible.', 'Prepare an alarm if needed.', 'Let the rest count as care.'] },
  { id: 'mental-reset', label: 'Mental reset', keywords: ['break', 'reset', 'stress', 'mental'], chips: ['Pause', 'Breathe', 'Tiny Step'], steps: ['Pause and lower the pressure.', 'Choose one small calming action.', 'Write the next tiny step for later.', 'Return only when you feel ready.'] },
  { id: 'work-meeting', label: 'Work meeting', keywords: ['work meeting', 'office meeting'], chips: ['Agenda', 'Notes', 'Questions', 'Follow Up'], steps: ['Check the agenda or meeting purpose.', 'Prepare notes or files.', 'Write two useful questions.', 'Capture follow-up actions after.'], prepHeavy: true },
  { id: 'online-meeting', label: 'Online meeting', keywords: ['online meeting', 'zoom', 'google meet', 'teams', 'meet link'], chips: ['Link', 'Device', 'Agenda', 'Notes'], steps: ['Check the meeting link and platform.', 'Charge your device and test audio.', 'Prepare agenda notes or questions.', 'Join a few minutes early if possible.'], prepHeavy: true },
  { id: 'physical-meeting', label: 'Physical meeting', keywords: ['physical meeting', 'meet at', 'faculty office', 'room'], chips: ['Location', 'Travel', 'Notes', 'Arrive'], steps: ['Confirm the room or location.', 'Plan travel time.', 'Prepare notes, documents, or laptop.', 'Leave a small buffer before the meeting.'], prepHeavy: true },
  { id: 'interview', label: 'Interview', keywords: ['interview'], chips: ['Research', 'Practice', 'Outfit', 'Arrive'], steps: ['Research the role or organization.', 'Prepare examples and questions.', 'Choose outfit and documents early.', 'Plan route or meeting link.', 'Do a calm final check.'], prepHeavy: true },
  { id: 'supervisor-meeting', label: 'Supervisor meeting', keywords: ['supervisor', 'advisor'], chips: ['Progress', 'Questions', 'Files', 'Next Steps'], steps: ['Prepare a short progress update.', 'List decisions or questions you need.', 'Bring files, screenshots, or draft work.', 'Write next actions after the meeting.'], prepHeavy: true },
  { id: 'client-meeting', label: 'Client meeting', keywords: ['client', 'customer'], chips: ['Context', 'Questions', 'Notes', 'Follow Up'], steps: ['Review client context before meeting.', 'Prepare questions and expected outcome.', 'Keep notes during the discussion.', 'Send or save follow-up actions.'], prepHeavy: true },
  { id: 'team-discussion', label: 'Team discussion', keywords: ['team discussion', 'discussion'], chips: ['Topic', 'Input', 'Decision'], steps: ['Clarify the discussion topic.', 'Prepare your input briefly.', 'Capture decisions and owners.', 'Update your next task.'] },
  { id: 'admin-office', label: 'Admin appointment', keywords: ['admin', 'office appointment', 'counter'], chips: ['Documents', 'Queue', 'Confirm'], steps: ['Prepare required documents or IDs.', 'Check office time and location.', 'Arrive with a small buffer.', 'Save the confirmation or receipt.'] },
  { id: 'birthday', label: 'Birthday event', keywords: ['birthday'], chips: ['Gift', 'Message', 'Travel', 'Celebrate'], steps: ['Prepare the gift, card, or message.', 'Confirm the time and place.', 'Plan travel or delivery.', 'Set a gentle reminder before leaving.'], prepHeavy: true },
  { id: 'anniversary', label: 'Anniversary', keywords: ['anniversary'], chips: ['Plan', 'Gift', 'Booking', 'Time'], steps: ['Choose the plan or gesture.', 'Prepare gift, message, or booking.', 'Confirm timing and location.', 'Keep a little buffer for getting ready.'], prepHeavy: true },
  { id: 'dinner-date', label: 'Dinner date', keywords: ['dinner date', 'date night'], chips: ['Booking', 'Outfit', 'Travel', 'Message'], steps: ['Confirm booking or dinner place.', 'Plan outfit and travel time.', 'Prepare anything you want to bring.', 'Send a confirmation message if helpful.'], prepHeavy: true },
  { id: 'family', label: 'Family gathering', keywords: ['family gathering', 'family dinner', 'family'], chips: ['Time', 'Items', 'Travel'], steps: ['Confirm time and place with family.', 'Prepare any food, gift, or item to bring.', 'Plan travel time.', 'Send a note if plans change.'] },
  { id: 'friend', label: 'Friend meetup', keywords: ['friend meetup', 'meet friends', 'hangout'], chips: ['Confirm', 'Travel', 'Budget'], steps: ['Confirm the place and time.', 'Plan travel and budget.', 'Prepare anything you need to bring.', 'Leave space to enjoy it.'] },
  { id: 'wedding', label: 'Wedding or event', keywords: ['wedding', 'ceremony', 'event attendance'], chips: ['Outfit', 'Gift', 'Route', 'Arrive'], steps: ['Prepare outfit and invitation details.', 'Get gift or contribution ready.', 'Plan route and parking if needed.', 'Arrive with a comfortable buffer.'], prepHeavy: true },
  { id: 'party', label: 'Party planning', keywords: ['party'], chips: ['Guests', 'Food', 'Setup', 'Cleanup'], steps: ['Confirm guests and time.', 'Plan food, music, or setup items.', 'Prepare the space before people arrive.', 'Keep cleanup simple afterward.'], prepHeavy: true },
  { id: 'gift', label: 'Gift preparation', keywords: ['gift', 'present'], chips: ['Choose', 'Buy', 'Wrap', 'Bring'], steps: ['Choose the gift idea.', 'Buy or prepare it early.', 'Wrap or write a small note.', 'Put it near your bag before leaving.'], prepHeavy: true },
  { id: 'travel', label: 'Travel plan', keywords: ['travel', 'trip', 'vacation'], chips: ['Tickets', 'Pack', 'Route', 'Backup'], steps: ['Confirm tickets, booking, and dates.', 'Make a small packing list.', 'Plan route to the station or airport.', 'Keep documents and charger easy to reach.'], prepHeavy: true },
  { id: 'flight-train', label: 'Flight or train', keywords: ['flight', 'bus', 'train'], chips: ['Ticket', 'Pack', 'Depart', 'Check In'], steps: ['Check ticket time and gate/platform details.', 'Prepare ID and booking proof.', 'Pack essentials early.', 'Leave with enough travel buffer.'], prepHeavy: true },
  { id: 'hotel', label: 'Hotel stay', keywords: ['hotel', 'check in', 'check-in'], chips: ['Booking', 'ID', 'Pack', 'Check In'], steps: ['Confirm booking and check-in time.', 'Prepare ID and payment card.', 'Pack overnight essentials.', 'Save the hotel address.'] },
  { id: 'road-trip', label: 'Road trip', keywords: ['road trip', 'drive'], chips: ['Route', 'Fuel', 'Items', 'Rest'], steps: ['Check route and estimated travel time.', 'Prepare fuel, toll card, and parking plan.', 'Pack water, charger, and essentials.', 'Plan a rest stop if needed.'], prepHeavy: true },
  { id: 'religious', label: 'Religious event', keywords: ['prayer', 'religious', 'mosque', 'church', 'temple'], chips: ['Time', 'Dress', 'Travel'], steps: ['Confirm event time and location.', 'Prepare suitable clothes or items.', 'Plan travel time.', 'Arrive calmly.'] },
  { id: 'club', label: 'Club activity', keywords: ['club', 'society'], chips: ['Role', 'Items', 'Time'], steps: ['Check your role for the activity.', 'Prepare items or materials needed.', 'Confirm time and place.', 'Capture next actions after.'] },
  { id: 'competition', label: 'Competition', keywords: ['competition', 'contest', 'hackathon'], chips: ['Rules', 'Practice', 'Materials', 'Rest'], steps: ['Review rules and judging criteria.', 'Prepare materials or setup.', 'Practice the important part.', 'Pack essentials and rest before it.'], prepHeavy: true },
  { id: 'workshop', label: 'Workshop or class', keywords: ['workshop', 'class', 'seminar'], chips: ['Register', 'Materials', 'Notes'], steps: ['Confirm registration and time.', 'Prepare notebook, laptop, or materials.', 'Join or arrive a little early.', 'Save useful notes after.'] },
  { id: 'call', label: 'Important call', keywords: ['call', 'phone'], chips: ['Number', 'Notes', 'Follow Up'], steps: ['Confirm the number or contact.', 'Write the key points before calling.', 'Keep notes during the call.', 'Save follow-up actions.'] },
  { id: 'application', label: 'Application deadline', keywords: ['application', 'deadline', 'apply'], chips: ['Requirements', 'Documents', 'Review', 'Submit'], steps: ['List required documents and criteria.', 'Prepare the application file or form.', 'Review details before submitting.', 'Save confirmation after submission.'], prepHeavy: true },
  { id: 'career-application', label: 'Career or scholarship application', keywords: ['scholarship', 'internship', 'job application', 'resume', 'cv'], chips: ['Criteria', 'CV', 'Letter', 'Submit'], steps: ['Check criteria and required documents.', 'Update CV or resume.', 'Prepare answers, letter, or portfolio.', 'Review and submit before the deadline.'], prepHeavy: true },
  { id: 'shopping-item', label: 'Specific shopping', keywords: ['buy', 'shopping', 'purchase'], chips: ['Compare', 'Budget', 'Buy'], steps: ['Confirm the exact item needed.', 'Compare price, size, or model briefly.', 'Set a budget before buying.', 'Keep receipt or warranty if needed.'] },
  { id: 'vehicle-service', label: 'Vehicle service', keywords: ['car service', 'bike service', 'motor service'], chips: ['Book', 'Issues', 'Travel', 'Pay'], steps: ['Book or confirm service time.', 'Write symptoms or issues to mention.', 'Plan transport while waiting.', 'Keep receipt and next service date.'] },
  { id: 'pet-care', label: 'Pet care', keywords: ['pet', 'cat', 'dog', 'vet'], chips: ['Food', 'Care', 'Appointment'], steps: ['Check food, medicine, or care items.', 'Prepare carrier or leash if going out.', 'Set timing for feeding or appointment.', 'Note any follow-up care.'] },
  { id: 'home-repair', label: 'Home repair', keywords: ['repair', 'fix', 'plumber', 'electrician'], chips: ['Problem', 'Tools', 'Schedule', 'Check'], steps: ['Describe the problem clearly.', 'Prepare tools or photos if needed.', 'Confirm appointment or repair time.', 'Check the fix before closing.'] },
  { id: 'banking', label: 'Banking or finance', keywords: ['bank', 'finance', 'atm', 'transfer'], chips: ['Details', 'Secure', 'Proof'], steps: ['Prepare account or reference details.', 'Use a secure moment to complete it.', 'Double-check amount and recipient.', 'Save proof or screenshot.'] },
  { id: 'government', label: 'Official task', keywords: ['government', 'passport', 'ic', 'immigration', 'jpj', 'lhdn'], chips: ['Documents', 'Appointment', 'Queue', 'Confirm'], steps: ['Check required documents and copies.', 'Confirm appointment, office, or counter time.', 'Bring ID, payment method, and proof.', 'Save the official confirmation.'], prepHeavy: true },
  { id: 'unclear', label: 'Big unclear task', keywords: ['plan', 'organize', 'prepare'], chips: ['Clarify', 'Break Down', 'Start', 'Review'], steps: ['Write what done should look like.', 'Break it into three tiny actions.', 'Start with the easiest action.', 'Review what remains after one session.'], prepHeavy: true },
];

function textOf(input: SmartPlanInput) {
  return `${input.title} ${input.description || ''} ${input.location || ''}`.toLowerCase();
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

export function detectMiloSituation(input: SmartPlanInput): Situation {
  const text = textOf(input);
  const matched = situations.find((situation) => includesAny(text, situation.keywords));

  if (matched) return matched;

  if (input.plannerType === 'meeting') {
    return situations.find((situation) => situation.id === 'work-meeting') || situations[0];
  }

  if (input.plannerType === 'date') {
    return situations.find((situation) => situation.id === 'friend') || situations[0];
  }

  return situations.find((situation) => situation.id === 'unclear') || situations[0];
}

export function needsPreparation(input: SmartPlanInput) {
  const situation = detectMiloSituation(input);
  const duration = input.estimatedDurationMinutes || 0;
  const hasLongDescription = (input.description || '').length > 80;

  return Boolean(
    situation.prepHeavy ||
      duration >= 90 ||
      input.priority === 'high' ||
      hasLongDescription ||
      input.plannerType === 'meeting' ||
      input.plannerType === 'date'
  );
}

export function calculateMiloUrgency(
  input: SmartPlanInput,
  now: Date = new Date()
): MiloUrgencyLevel {
  if (input.status === 'completed') return 'done';

  const daysUntilDue = getDaysUntilDue(input.dueDate, now);
  const prepNeeded = needsPreparation(input);

  if (daysUntilDue === undefined) {
    return input.priority === 'high' || prepNeeded ? 'medium' : 'low';
  }

  if (daysUntilDue < 0 || daysUntilDue === 0) return 'high';

  if (daysUntilDue === 1) {
    return input.priority === 'high' || prepNeeded || input.plannerType !== 'task'
      ? 'high'
      : 'medium';
  }

  if (daysUntilDue <= 3) {
    return input.priority === 'high' || prepNeeded ? 'medium' : 'low';
  }

  if (input.priority === 'high') return prepNeeded ? 'medium' : 'low';

  return 'low';
}

export function generateSmartPlanChips(input: SmartPlanInput) {
  return detectMiloSituation(input).chips;
}

export function generateMiloSmartPlan(input: SmartPlanInput): MiloSmartPlanStep[] {
  const situation = detectMiloSituation(input);
  const steps = [...situation.steps];
  const text = textOf(input);

  if (input.location && !steps.some((step) => step.toLowerCase().includes('location'))) {
    steps.splice(Math.min(steps.length, 2), 0, 'Check the location and travel time.');
  }

  if (text.includes('http') || text.includes('zoom') || text.includes('meet')) {
    steps.unshift('Open and test the meeting link before the start time.');
  }

  if ((input.estimatedDurationMinutes || 0) >= 120) {
    steps.splice(1, 0, 'Split this into two shorter sessions so it feels lighter.');
  }

  if (input.reminder && input.reminder !== 'none') {
    steps.push('Keep the manual reminder as the final alert.');
  }

  return steps.slice(0, 6).map((title, index) => ({
    id: `${situation.id}-${index}`,
    title,
    reason: situation.label,
  }));
}

export function generateMiloSmartNudges(input: SmartPlanInput): MiloSmartNudge[] {
  const urgency = calculateMiloUrgency(input);
  const daysUntilDue = getDaysUntilDue(input.dueDate);
  const prepNeeded = needsPreparation(input);
  const nudges: MiloSmartNudge[] = [];

  if (daysUntilDue === 0) {
    nudges.push({
      id: 'morning',
      label: 'Morning',
      timing: 'Today morning',
      message: 'Milo checks the first small step before the day gets full.',
    });
    nudges.push({
      id: 'check-in',
      label: 'Check in',
      timing: 'Today afternoon',
      message: 'A gentle progress check keeps this manageable.',
    });
  } else if (daysUntilDue !== undefined && daysUntilDue > 1) {
    nudges.push({
      id: 'start-early',
      label: 'Start early',
      timing: daysUntilDue <= 3 ? 'Today' : 'A few days before',
      message: prepNeeded
        ? 'Milo suggests preparing before the final reminder.'
        : 'One small early step can make this easier.',
    });
    nudges.push({
      id: 'one-day',
      label: 'Check in',
      timing: '1 day before',
      message: 'Milo checks what is left while there is still room.',
    });
  } else {
    nudges.push({
      id: 'start',
      label: 'Start gently',
      timing: urgency === 'high' ? 'Soon' : 'When ready',
      message: 'Milo helps you choose one tiny first step.',
    });
  }

  if (prepNeeded) {
    nudges.unshift({
      id: 'prep',
      label: 'Prep nudge',
      timing: daysUntilDue === 0 ? 'Before the final stretch' : 'Earlier prep',
      message: 'Milo noticed this may need preparation before the deadline.',
    });
  }

  nudges.push({
    id: 'final',
    label: 'Final reminder',
    timing: input.reminder && input.reminder !== 'none' ? input.reminder : 'Near due time',
    message: 'Your manual reminder stays as the final alert.',
  });

  return nudges.slice(0, 4);
}

export function buildMiloSmartData(input: SmartPlanInput) {
  return {
    situation: detectMiloSituation(input),
    urgency: calculateMiloUrgency(input),
    chips: generateSmartPlanChips(input),
    plan: generateMiloSmartPlan(input),
    nudges: generateMiloSmartNudges(input),
    needsPreparation: needsPreparation(input),
  };
}
