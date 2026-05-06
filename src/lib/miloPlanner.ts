import { Task } from '../types/task';
import { generateMiloSmartPlan } from './miloSmartPlan';

export function generateMiloPlan(task: Task): string[] {
  return generateMiloSmartPlan(task).map((step) => step.title);
}
