// The Learn tab's words to Claude and its notes' arithmetic. Pure; the hooks are in register.tsx.

import type { Lang, LearnAsk, LearnKind, LearnNote } from '../../types'

export const LEARN_TOOL_NAME = 'explain'

export const LEARN_KINDS: readonly LearnKind[] = ['tech', 'concept', 'step']

// The most notes a session keeps, the most one call adds, and the longest
// title, text and why a note holds: short, so they cost little to write and to
// keep in the context.
export const MAX_NOTES = 100
export const MAX_PER_CALL = 5
export const MAX_TITLE = 40
export const MAX_TEXT = 300
export const MAX_WHY = 200
// The most of a request's text kept to head its notes.
export const MAX_ASK = 80

// Each kind's label color in the tab: cyan, magenta, green.
export const KIND_COLORS: Record<LearnKind, string> = { tech: '#06b6d4', concept: '#d946ef', step: '#22c55e' }

// The rules live here alone, read only while learn mode is on; the prompt
// section just says so and in which language.
export const LEARN_TOOL_DESCRIPTION =
  'Shows short notes in the Learn panel the user reads while you work. Send it in the same response as the ' +
  'tool call it explains, never on its own, with every note for that step in one call. Only for a technology, ' +
  'library, pattern or notable command the first time it comes up, or the start of a big step; at most 3 notes ' +
  'per request; never for trivial actions like reading files, nor from a subagent. Each note: a title, one ' +
  'sentence on what it is and does here and, when it helps, one on why it was picked.'

export const LEARN_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    notes: {
      type: 'array',
      maxItems: MAX_PER_CALL,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'A short name, like "Vite".' },
          text: { type: 'string', description: 'One sentence: what it is and does here.' },
          why: { type: 'string', description: 'Optional, one sentence: why it was picked.' },
          kind: { type: 'string', enum: ['tech', 'concept', 'step'] },
        },
        required: ['title', 'text'],
      },
    },
  },
  required: ['notes'],
}

const PROMPTS: Record<Lang, string> = {
  pt: 'Modo Aprender ligado: o usuário acompanha suas explicações num painel. Use a ferramenta explain (mcp__extra-mods__explain) como a descrição dela pede, escrevendo em português.',
  en: 'Learn mode is on: the user follows your explanations in a panel. Use the explain tool (mcp__extra-mods__explain) as its description says, writing in English.',
}

// The system prompt section that asks Claude for explanations, in the panel's language.
export const learnPrompt = (lang: Lang) => PROMPTS[lang]

// `s` cut to `max` characters, the last one an ellipsis.
const cut = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

export type NoteResult = { note: LearnNote } | { error: string }

// Reads one note of the explain tool's input, or says what is missing.
export function toNote(input: unknown, id: string, at: number): NoteResult {
  const raw = (input ?? {}) as { title?: unknown; text?: unknown; why?: unknown; kind?: unknown }
  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  const text = typeof raw.text === 'string' ? raw.text.trim() : ''
  const missing = [title === '' ? 'title' : '', text === '' ? 'text' : ''].filter(m => m !== '')
  if (missing.length > 0) return { error: `explain needs a non-empty ${missing.join(' and ')}.` }
  const kind = LEARN_KINDS.includes(raw.kind as LearnKind) ? (raw.kind as LearnKind) : 'concept'
  const why = typeof raw.why === 'string' ? raw.why.trim() : ''
  const note: LearnNote = { id, title: cut(title, MAX_TITLE), text: cut(text, MAX_TEXT), kind, at }
  return { note: why === '' ? note : { ...note, why: cut(why, MAX_WHY) } }
}

export type NotesResult = { notes: LearnNote[]; errors: string[] }

// A `notes` list sent as JSON text, as models now and then send an array.
const parsed = (notes: unknown): unknown => {
  if (typeof notes !== 'string') return notes
  try {
    return JSON.parse(notes)
  } catch {
    return notes
  }
}

// Reads the explain tool's input into its notes: a `notes` list, or one note
// given at the top level as before. A note missing its title or text is
// skipped and said, the rest kept; past MAX_PER_CALL the rest are dropped.
export function toNotes(input: unknown, id: string, at: number): NotesResult {
  const notes = parsed(((input ?? {}) as { notes?: unknown }).notes)
  const items = Array.isArray(notes) ? notes.slice(0, MAX_PER_CALL) : [input]
  if (items.length === 0) return { notes: [], errors: ['explain needs at least one note.'] }
  const one = items.length === 1
  return items.reduce<NotesResult>(
    (acc, item, i) => {
      const made = toNote(item, one ? id : `${id}:${i}`, at)
      if ('note' in made) acc.notes.push(made.note)
      else acc.errors.push(one ? made.error : `note ${i + 1}: ${made.error}`)
      return acc
    },
    { notes: [], errors: [] },
  )
}

// The key titles are compared on: case and runs of spaces aside.
const titleKey = (title: string) => title.trim().toLowerCase().replace(/\s+/g, ' ')

export type FreshResult = { fresh: LearnNote[]; repeated: string[] }

// Of `made`, the notes whose title the session has not shown yet (`list`, or
// one before it in `made`), and the titles of the rest.
export function freshNotes(list: readonly LearnNote[], made: readonly LearnNote[]): FreshResult {
  const seen = new Set(list.map(n => titleKey(n.title)))
  return made.reduce<FreshResult>(
    (acc, note) => {
      const key = titleKey(note.title)
      if (seen.has(key)) acc.repeated.push(note.title)
      else {
        seen.add(key)
        acc.fresh.push(note)
      }
      return acc
    },
    { fresh: [], repeated: [] },
  )
}

// What the explain tool answers: "ok", then what it skipped and what it had
// already shown, so Claude reads next to nothing and learns not to repeat.
export const learnAnswer = (errors: readonly string[], repeated: readonly string[]) =>
  [
    'ok',
    ...(errors.length === 0 ? [] : [`skipped ${errors.join(' ')}`]),
    ...(repeated.length === 0 ? [] : [`already shown: ${repeated.join(', ')}`]),
  ].join('; ')

// The request a typed prompt starts: the one after `last`, headed by the
// prompt's first line.
export const nextAsk = (last: LearnAsk | null, prompt: string): LearnAsk => ({
  n: (last?.n ?? 0) + 1,
  text: cut((prompt.split('\n')[0] ?? '').trim(), MAX_ASK),
})

// The list with `note` added last, keeping the newest MAX_NOTES.
export const addNote = (list: readonly LearnNote[], note: LearnNote): LearnNote[] => [...list, note].slice(-MAX_NOTES)

// The columns the pane asks for on the Learn tab: 40% of the terminal, never
// under the menu's own width.
export const learnColumns = (terminalColumns: number, floor = 56) => Math.max(floor, Math.round(terminalColumns * 0.4))

// Cells a note's label and the space after it take: the widest, "● tecnologia ".
const LABEL_CELLS = 13
// Cells the why line's lead takes: the widest, "→ por quê: ".
const WHY_CELLS = 11

// Rows a note's card takes in a list `width` cells wide: its border above and
// below, its label and title, its text as wrapped and its why line. Inside, the
// border and padding leave it `width - 4` cells.
export const noteRows = (note: LearnNote, width: number) => {
  const w = Math.max(1, width - 4)
  const head = Math.max(1, Math.ceil((LABEL_CELLS + note.title.length) / w))
  const body = note.text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / w)), 0)
  const why = note.why === undefined ? 0 : Math.ceil((WHY_CELLS + note.why.length) / w)
  return 2 + head + body + why
}

// The request whose heading the list draws above `shown[i]`: the first note
// shown, and each note of a request other than the one before it. Notes from
// before any request typed get none.
export const askHeading = (shown: readonly LearnNote[], i: number): LearnAsk | null => {
  const ask = shown[i]?.ask
  return ask !== undefined && (i === 0 || shown[i - 1]?.ask?.n !== ask.n) ? ask : null
}

// A request's heading, one row `width` cells wide: "── its text ─────".
export const askLine = (ask: LearnAsk, width: number) => {
  const label = `── ${cut(ask.text, Math.max(1, width - 6))} `
  return label + '─'.repeat(Math.max(0, width - label.length))
}

// Rows the notes `shown` take as the list draws them, headings included.
const shownRows = (shown: readonly LearnNote[], width: number) =>
  shown.reduce((n, note, i) => n + noteRows(note, width) + (askHeading(shown, i) === null ? 0 : 1), 0)

// The rows the Learn page leaves its list: the body less the tab strip (3),
// the heading (2), the framed switch (3), the note under it, the "newer" line
// while there is one, the language footer (6) and one spare row.
export const learnRows = (bodyRows: number, noteLines: number, hasNewer: boolean) =>
  Math.max(3, bodyRows - (3 + 2 + 3 + noteLines + (hasNewer ? 1 : 0) + 6 + 1))

// The notes the list draws, oldest first: with `scroll` of the newest hidden
// below, the newest that fit in `rows` with their requests' headings. `isTall` when even the newest shown
// does not fit, so the list shows its top (label and title) and cuts its end.
export function fitNotes(notes: readonly LearnNote[], scroll: number, rows: number, width: number) {
  const end = Math.min(notes.length, Math.max(1, notes.length - scroll))
  if (end === 0) return { shown: [] as LearnNote[], isTall: false }
  let start = end - 1
  const isTall = shownRows(notes.slice(start, end), width) > rows
  while (start > 0 && shownRows(notes.slice(start - 1, end), width) <= rows) start--
  return { shown: notes.slice(start, end), isTall }
}

// The scroll after a wheel move of `by` rows: up (negative) hides one more of
// the newest notes, down one fewer; one note always shows.
export const scrollNotes = (scroll: number, by: number, count: number) =>
  by === 0 ? scroll : Math.max(0, Math.min(Math.max(0, count - 1), scroll + (by < 0 ? 1 : -1)))
