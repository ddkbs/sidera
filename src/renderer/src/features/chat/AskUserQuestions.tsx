import { Questionnaire } from '@shadcn/react/questionnaire'
import { useState } from 'react'
import type { AskUserAnswer, AskUserQuestion } from '@shared/api'
import { ArrowRight, Check, CircleDot } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { answersFromValues, summarizeAnswers, toItemDefinitions } from './askUserQuestionsHelpers'

interface Props {
  requestId: string
  questions: AskUserQuestion[]
  /** Present once answered/skipped locally — renders the collapsed summary instead of the live form. */
  answers?: AskUserAnswer[] | 'skipped'
  onSubmit: (requestId: string, answers: AskUserAnswer[]) => void
  onSkip: (requestId: string) => void
}

/**
 * Inline clarifying-questions card for the chat panel, built on `@shadcn/react/questionnaire`
 * (a headless, one-question-at-a-time wizard — a good fit for the 380px chat rail). Collapses
 * into a compact summary once answered or skipped.
 */
export function AskUserQuestions({ requestId, questions, answers, onSubmit, onSkip }: Props) {
  const [item, setItem] = useState(questions[0]?.id)

  if (answers) {
    const rows = answers === 'skipped' ? null : summarizeAnswers(questions, answers)
    return (
      <div className="max-w-full space-y-1 rounded-xl border bg-card px-3 py-2.5 text-sm">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Check className="size-3.5 text-primary" />
          {rows ? 'Answered' : 'Skipped'}
        </div>
        {rows && (
          <dl className="space-y-1">
            {rows.map((r, i) => (
              <div key={i} className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">{r.question}</dt>
                <dd className="truncate font-medium">{r.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    )
  }

  const items = toItemDefinitions(questions)

  return (
    <Questionnaire.Root
      items={items}
      item={item}
      onItemChange={setItem}
      shortcuts="numbers"
      className="max-w-full space-y-3 rounded-xl border bg-card p-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        const valuesById: Record<string, string[]> = {}
        for (const q of questions) valuesById[q.id] = data.getAll(q.id).map(String)
        onSubmit(requestId, answersFromValues(questions, valuesById))
      }}
    >
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <Questionnaire.Progress
          render={(props, state) => (
            <div {...props} className="h-full rounded-full bg-primary transition-all" style={{ width: state.total ? `${(state.current / state.total) * 100}%` : 0 }} />
          )}
        />
      </div>

      {questions.map((q) => (
        <Questionnaire.Item key={q.id} name={q.id} multiple={q.type === 'multi'} required className="space-y-2 border-none p-0">
          <Questionnaire.Title className="text-sm font-medium">{q.question}</Questionnaire.Title>
          {q.type === 'text' ? (
            <Questionnaire.Input
              className="w-full rounded-lg border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              placeholder="Type your answer…"
            />
          ) : (
            <Questionnaire.Choices className="space-y-1.5">
              {(q.options ?? []).map((o) => (
                <Questionnaire.Choice
                  key={o.label}
                  value={o.label}
                  className="group flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-1.5 transition data-[checked]:border-primary data-[checked]:bg-primary/5"
                >
                  <Questionnaire.ChoiceInput className="sr-only" />
                  <CircleDot className="mt-0.5 size-3.5 shrink-0 text-muted-foreground group-data-[checked]:text-primary" />
                  <div className="min-w-0">
                    <Questionnaire.ChoiceLabel className="block truncate font-medium">{o.label}</Questionnaire.ChoiceLabel>
                    {o.description && <p className="text-xs text-muted-foreground">{o.description}</p>}
                  </div>
                </Questionnaire.Choice>
              ))}
            </Questionnaire.Choices>
          )}
        </Questionnaire.Item>
      ))}

      <div className="flex items-center justify-between gap-2 pt-1">
        <button type="button" onClick={() => onSkip(requestId)} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
          Skip
        </button>
        <div className="flex items-center gap-1.5">
          <Questionnaire.Previous render={<Button type="button" variant="ghost" size="sm" />}>Back</Questionnaire.Previous>
          <Questionnaire.Next render={<Button type="button" size="sm" className={cn('gap-1')} />}>
            Next <ArrowRight className="size-3.5" />
          </Questionnaire.Next>
          <Questionnaire.Submit render={<Button type="submit" size="sm" />}>Submit</Questionnaire.Submit>
        </div>
      </div>
    </Questionnaire.Root>
  )
}
