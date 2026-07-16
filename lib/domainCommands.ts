import type { AgentAction } from './aiAgent';

export type DomainCommandId =
  | 'set_exercise_completion'
  | 'update_exercise_note'
  | 'record_health_observation'
  | 'set_exercise_metrics'
  | 'update_exercise_library'
  | 'update_exercise_category'
  | 'update_doctor_note'
  | 'update_pt_session'
  | 'update_app_preference'
  | 'attach_media';

export type DomainCommandDefinition = {
  id: DomainCommandId;
  description: string;
  transactional: boolean;
  auditRequired: boolean;
  undoable: boolean;
  targetCallers: Array<'ui' | 'ai'>;
  implementation: 'registry-seam' | 'shared-validation' | 'shared-handler';
};

// This is the stable mutation seam. The current routes are being moved behind these
// contracts incrementally; capabilities refer to command IDs rather than tables or
// user_config keys so persistence can later change without changing the planner.
export const DOMAIN_COMMAND_REGISTRY: Readonly<Record<DomainCommandId, DomainCommandDefinition>> = Object.freeze({
  set_exercise_completion: { id: 'set_exercise_completion', description: 'Set completion for one exercise and date.', transactional: true, auditRequired: true, undoable: true, targetCallers: ['ui', 'ai'], implementation: 'registry-seam' },
  update_exercise_note: { id: 'update_exercise_note', description: 'Append, replace, or clear a dated exercise note.', transactional: true, auditRequired: true, undoable: true, targetCallers: ['ui', 'ai'], implementation: 'registry-seam' },
  record_health_observation: { id: 'record_health_observation', description: 'Record a dated health metric or note field.', transactional: true, auditRequired: true, undoable: true, targetCallers: ['ui', 'ai'], implementation: 'shared-validation' },
  set_exercise_metrics: { id: 'set_exercise_metrics', description: 'Set or clear dated exercise metrics.', transactional: true, auditRequired: true, undoable: true, targetCallers: ['ui', 'ai'], implementation: 'shared-validation' },
  update_exercise_library: { id: 'update_exercise_library', description: 'Create, edit, move, or remove an exercise.', transactional: true, auditRequired: true, undoable: true, targetCallers: ['ui', 'ai'], implementation: 'registry-seam' },
  update_exercise_category: { id: 'update_exercise_category', description: 'Create, edit, or remove an exercise category.', transactional: true, auditRequired: true, undoable: true, targetCallers: ['ui', 'ai'], implementation: 'registry-seam' },
  update_doctor_note: { id: 'update_doctor_note', description: 'Create, edit, or remove a doctor note.', transactional: true, auditRequired: true, undoable: true, targetCallers: ['ui', 'ai'], implementation: 'registry-seam' },
  update_pt_session: { id: 'update_pt_session', description: 'Create, edit, or remove a PT/training session.', transactional: true, auditRequired: true, undoable: true, targetCallers: ['ui', 'ai'], implementation: 'registry-seam' },
  update_app_preference: { id: 'update_app_preference', description: 'Change an app preference or title.', transactional: true, auditRequired: true, undoable: true, targetCallers: ['ui', 'ai'], implementation: 'registry-seam' },
  attach_media: { id: 'attach_media', description: 'Attach user-selected media to a supported entity.', transactional: true, auditRequired: true, undoable: true, targetCallers: ['ui', 'ai'], implementation: 'registry-seam' },
});

export function domainCommandForAgentAction(action: AgentAction): DomainCommandId | null {
  switch (action.type) {
    case 'completion_set':
    case 'bulk_completion_from_note': return 'set_exercise_completion';
    case 'exercise_note_change': return 'update_exercise_note';
    case 'health_change': return 'record_health_observation';
    case 'metrics_set':
    case 'metrics_clear': return 'set_exercise_metrics';
    case 'exercise_add':
    case 'exercise_update':
    case 'exercise_move':
    case 'exercise_remove': return 'update_exercise_library';
    case 'category_upsert':
    case 'category_remove': return 'update_exercise_category';
    case 'doctor_note_upsert':
    case 'doctor_note_remove': return 'update_doctor_note';
    case 'pt_session_upsert':
    case 'pt_session_remove': return 'update_pt_session';
    case 'widget_set':
    case 'app_title_set': return 'update_app_preference';
    case 'photo_attach': return 'attach_media';
    case 'navigate': return null;
  }
}

export function domainCommandsForAgentActions(actions: AgentAction[]) {
  return Array.from(new Set(actions.map(domainCommandForAgentAction).filter((value): value is DomainCommandId => Boolean(value))));
}

export function isDomainDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
