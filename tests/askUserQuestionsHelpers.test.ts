import { describe, expect, it } from 'vitest'
import type { AskUserQuestion } from '@shared/api'
import { answersFromValues, summarizeAnswers, toItemDefinitions } from '../src/renderer/src/features/chat/askUserQuestionsHelpers'

const questions: AskUserQuestion[] = [
  { id: 'format', question: 'Which format?', type: 'single', options: [{ label: 'Markdown' }, { label: 'Plain text' }] },
  { id: 'tags', question: 'Which tags apply?', type: 'multi', options: [{ label: 'Work' }, { label: 'Personal' }] },
  { id: 'title', question: 'What title?', type: 'text' }
]

describe('toItemDefinitions', () => {
  it('maps choice questions to items with choices, and text questions without', () => {
    expect(toItemDefinitions(questions)).toEqual([
      { name: 'format', required: true, choices: [{ value: 'Markdown' }, { value: 'Plain text' }] },
      { name: 'tags', required: true, choices: [{ value: 'Work' }, { value: 'Personal' }] },
      { name: 'title', required: true }
    ])
  })
})

describe('answersFromValues', () => {
  it('builds one answer per question, trimming and dropping blanks', () => {
    const answers = answersFromValues(questions, {
      format: ['Markdown'],
      tags: ['Work', '', 'Personal'],
      title: ['  My note  ']
    })
    expect(answers).toEqual([
      { id: 'format', values: ['Markdown'] },
      { id: 'tags', values: ['Work', 'Personal'] },
      { id: 'title', values: ['My note'] }
    ])
  })

  it('answers a question with no values as an empty array (skipped)', () => {
    const answers = answersFromValues(questions, { format: ['Markdown'] })
    expect(answers.find((a) => a.id === 'title')).toEqual({ id: 'title', values: [] })
  })
})

describe('summarizeAnswers', () => {
  it('joins multi-select values and labels an empty answer as Skipped', () => {
    const summary = summarizeAnswers(questions, [
      { id: 'format', values: ['Markdown'] },
      { id: 'tags', values: ['Work', 'Personal'] },
      { id: 'title', values: [] }
    ])
    expect(summary).toEqual([
      { question: 'Which format?', value: 'Markdown' },
      { question: 'Which tags apply?', value: 'Work, Personal' },
      { question: 'What title?', value: 'Skipped' }
    ])
  })
})
