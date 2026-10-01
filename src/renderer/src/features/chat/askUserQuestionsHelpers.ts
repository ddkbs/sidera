import type { AskUserAnswer, AskUserQuestion } from '@shared/api'
import { t } from '../../lib/i18n'

/** Shape the `@shadcn/react/questionnaire` `Questionnaire.Root` component expects for `items`. */
export interface QuestionnaireItemDef {
  name: string
  required: boolean
  choices?: { value: string; disabled?: boolean }[]
}

/** Maps our tool-schema questions onto Questionnaire.Root's `items` prop. Pure. */
export function toItemDefinitions(questions: AskUserQuestion[]): QuestionnaireItemDef[] {
  return questions.map((q) => ({
    name: q.id,
    required: true,
    ...(q.type === 'text' ? {} : { choices: (q.options ?? []).map((o) => ({ value: o.label })) })
  }))
}

/** Turns raw form values (from FormData, keyed by question id) into AskUserAnswer[]. Pure — no DOM dependency. */
export function answersFromValues(questions: AskUserQuestion[], valuesById: Record<string, string[]>): AskUserAnswer[] {
  return questions.map((q) => ({ id: q.id, values: (valuesById[q.id] ?? []).map((v) => v.trim()).filter(Boolean) }))
}

/** Compact one-line-per-question summary shown once the questionnaire collapses. Pure. */
export function summarizeAnswers(questions: AskUserQuestion[], answers: AskUserAnswer[]): { question: string; value: string }[] {
  const byId = new Map(questions.map((q) => [q.id, q]))
  return answers.map((a) => ({
    question: byId.get(a.id)?.question ?? a.id,
    value: a.values.length ? a.values.join(', ') : t('ask.skipped')
  }))
}
