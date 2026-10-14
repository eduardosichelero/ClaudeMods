// The Learn tab's words to Claude and its notes' arithmetic. Pure; the hooks are in register.tsx.

import type { Lang, LearnKind, LearnNote } from '../../types'

export const LEARN_TOOL_NAME = 'explain'

export const LEARN_KINDS: readonly LearnKind[] = ['tech', 'concept', 'step']

// The most notes a session keeps, and the longest title and text a note holds.
export const MAX_NOTES = 100
export const MAX_TITLE = 80
export const MAX_TEXT = 600

// Each kind's label color in the tab: cyan, magenta, green.
export const KIND_COLORS: Record<LearnKind, string> = { tech: '#06b6d4', concept: '#d946ef', step: '#22c55e' }

export const LEARN_TOOL_DESCRIPTION =
  'Posts a short explanation to the Learn tab the user reads while you work. Call it when you choose a ' +
  'technology, library, tool, pattern or notable command, or start an important step: a short title and ' +
  '2 to 4 plain sentences on what it is, what it does here and why it was chosen over the alternatives.'

export const LEARN_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'A short name for what is explained, like "Vite" or "Why SQLite".' },
    text: { type: 'string', description: '2 to 4 plain sentences: what it is, what it does here, why it was chosen.' },
    kind: {
      type: 'string',
      enum: ['tech', 'concept', 'step'],
      description: 'tech: a technology or library; concept: an idea or pattern; step: what is being done now.',
    },
  },
  required: ['title', 'text'],
}

const PROMPTS: Record<Lang, string> = {
  pt: [
    'Modo Aprender ligado: o usuário está aprendendo e acompanha um painel lateral com as suas explicações.',
    'Sempre que escolher uma tecnologia, biblioteca, ferramenta, padrão ou comando relevante, ou começar um passo importante,',
    'chame a ferramenta explain (mcp__extra-mods__explain) antes ou logo ao fazê-lo, com um título curto e de 2 a 4 frases simples em português:',
    'o que é, para que serve aqui e por que foi escolhido em vez das alternativas.',
    'Não repita o que já explicou nesta sessão e não explique ações triviais, como ler arquivos ou listar pastas.',
  ].join(' '),
  en: [
    'Learn mode is on: the user is learning and follows a side panel with your explanations.',
    'Whenever you choose a technology, library, tool, pattern or notable command, or start an important step,',
    'call the explain tool (mcp__extra-mods__explain) before or as you do it, with a short title and 2 to 4 plain sentences in English:',
    'what it is, what it does here and why it was chosen over the alternatives.',
    'Do not repeat what you already explained this session, and do not explain trivial actions such as reading files or listing folders.',
  ].join(' '),
}

// The system prompt section that asks Claude for explanations, in the panel's language.
export const learnPrompt = (lang: Lang) => PROMPTS[lang]

// `s` cut to `max` characters, the last one an ellipsis.
const cut = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

export type NoteResult = { note: LearnNote } | { error: string }

// Reads the explain tool's input into a note, or says what is missing.
export function toNote(input: unknown, id: string, at: number): NoteResult {
  const raw = (input ?? {}) as { title?: unknown; text?: unknown; kind?: unknown }
  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  const text = typeof raw.text === 'string' ? raw.text.trim() : ''
  const missing = [title === '' ? 'title' : '', text === '' ? 'text' : ''].filter(m => m !== '')
  if (missing.length > 0) return { error: `explain needs a non-empty ${missing.join(' and ')}.` }
  const kind = LEARN_KINDS.includes(raw.kind as LearnKind) ? (raw.kind as LearnKind) : 'concept'
  return { note: { id, title: cut(title, MAX_TITLE), text: cut(text, MAX_TEXT), kind, at } }
}

// The list with `note` added last, keeping the newest MAX_NOTES.
export const addNote = (list: readonly LearnNote[], note: LearnNote): LearnNote[] => [...list, note].slice(-MAX_NOTES)

// The columns the pane asks for on the Learn tab: 40% of the terminal, never
// under the menu's own width.
export const learnColumns = (terminalColumns: number, floor = 56) => Math.max(floor, Math.round(terminalColumns * 0.4))

// The notes drawn with `scroll` of the newest hidden below: oldest first,
// ending at the newest shown, so the list is drawn anchored at its bottom.
export const visibleNotes = (notes: readonly LearnNote[], scroll: number) =>
  notes.slice(0, Math.max(1, notes.length - scroll))

// The scroll after a wheel move of `by` rows: up (negative) hides one more of
// the newest notes, down one fewer; one note always shows.
export const scrollNotes = (scroll: number, by: number, count: number) =>
  by === 0 ? scroll : Math.max(0, Math.min(Math.max(0, count - 1), scroll + (by < 0 ? 1 : -1)))
