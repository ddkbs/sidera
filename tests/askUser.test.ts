import { describe, expect, it } from 'vitest'
import { answersToToolResult, parseAskUserInput } from '../src/main/ai/askUser'

describe('parseAskUserInput', () => {
  it('parses well-formed single/multi/text questions', () => {
    const input = {
      questions: [
        { id: 'format', question: 'Which format?', type: 'single', options: [{ label: 'Markdown' }, { label: 'Plain text', description: 'No formatting' }] },
        { id: 'tags', question: 'Which tags apply?', type: 'multi', options: [{ label: 'Work' }, { label: 'Personal' }] },
        { id: 'title', question: 'What title?', type: 'text' }
      ]
    }
    expect(parseAskUserInput(input)).toEqual([
      { id: 'format', question: 'Which format?', type: 'single', options: [{ label: 'Markdown', description: undefined }, { label: 'Plain text', description: 'No formatting' }] },
      { id: 'tags', question: 'Which tags apply?', type: 'multi', options: [{ label: 'Work', description: undefined }, { label: 'Personal', description: undefined }] },
      { id: 'title', question: 'What title?', type: 'text' }
    ])
  })

  it('drops questions missing a question, type, or (for choice types) any valid option', () => {
    const input = {
      questions: [
        { id: 'a', question: '', type: 'text' },
        { id: 'b', question: 'No type given' },
        { id: 'c', question: 'No options', type: 'single', options: [] },
        { id: 'd', question: 'Bad option shape', type: 'single', options: [{ notLabel: 'x' }] },
        { id: 'e', question: 'Valid', type: 'text' }
      ]
    }
    expect(parseAskUserInput(input)).toEqual([{ id: 'e', question: 'Valid', type: 'text' }])
  })

  it('de-duplicates ids and defaults missing ids', () => {
    const input = {
      questions: [
        { question: 'First?', type: 'text' },
        { question: 'Second?', type: 'text' },
        { id: 'q1', question: 'Third?', type: 'text' }
      ]
    }
    const out = parseAskUserInput(input)
    const ids = out.map((q) => q.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('returns an empty array for missing/malformed input', () => {
    expect(parseAskUserInput(undefined)).toEqual([])
    expect(parseAskUserInput(null)).toEqual([])
    expect(parseAskUserInput({})).toEqual([])
    expect(parseAskUserInput({ questions: 'nope' })).toEqual([])
  })
})

describe('answersToToolResult', () => {
  const questions = [
    { id: 'format', question: 'Which format?', type: 'single' as const, options: [{ label: 'Markdown' }] },
    { id: 'title', question: 'What title?', type: 'text' as const }
  ]

  it('renders a skip as a clear instruction to proceed', () => {
    expect(answersToToolResult(questions, 'skipped')).toMatch(/skipped/i)
  })

  it('renders answers keyed by question text', () => {
    const result = answersToToolResult(questions, [
      { id: 'format', values: ['Markdown'] },
      { id: 'title', values: ['My note'] }
    ])
    expect(result).toContain('Which format?: Markdown')
    expect(result).toContain('What title?: My note')
  })

  it('marks an unanswered individual question as skipped', () => {
    const result = answersToToolResult(questions, [{ id: 'format', values: [] }])
    expect(result).toContain('Which format?: (skipped)')
  })
})
