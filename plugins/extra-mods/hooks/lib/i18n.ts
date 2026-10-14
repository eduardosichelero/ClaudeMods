// The panel's words in each language it speaks. Pure; the hooks are in register.tsx.

import type { Lang } from '../../types'

export const LANGS: readonly { lang: Lang; label: string }[] = [
  { lang: 'en', label: 'English' },
  { lang: 'pt', label: 'Português' },
]

const EN = {
  tabZen: 'Zen',
  tabThemes: 'Theme',
  tabMode: 'Mode',
  tabStatus: 'Status',
  close: 'esc ✕',
  keys: 'tab move · enter select · wheel scrolls · esc close',
  language: 'Language',
  on: 'On',
  off: 'Off',
  now: 'now',
  zenMode: 'Zen mode',
  bandColor: 'Band color',
  colorSuffix: 'color',
  kept: 'Kept',
  search: 'Search',
  themesCount: '{n} themes · click one to apply it',
  themesWait: 'Getting the themes from terminalcolors.com…',
  themesRetry: '↻ Try again',
  themesNone: 'No theme matches “{q}”.',
  defaultTheme: '↺ Claude Code default',
  downloadAgain: '⟳ Download again',
  terminalDefault: 'Terminal default',
  model: 'Model',
  modelDefault: "↺ Claude Code's default",
  effort: 'Effort',
  runningIn: 'Running in',
  runningUnknown: 'Shown after your next prompt',
  shiftTab: 'shift+tab switches it',
  newSessions: 'New sessions start in',
  bypassWarning: 'Bypass skips every permission check. Claude Code asks you to confirm it when the next session starts.',
  statusLine: 'Status line',
  statusNote: 'On takes your own statusLine command out of settings.json; Off puts it back.',
  m_default: 'ask',
  m_plan: 'plan',
  m_acceptEdits: 'accept edits',
  m_auto: 'auto',
  m_dontAsk: "don't ask",
  m_bypassPermissions: 'bypass permissions',
  tabLearn: 'Learn',
  learnMode: 'Learn mode',
  learnNote: 'On: Claude explains here the technologies and steps it picks. Off: it works as usual.',
  learnEmptyOn: 'No explanations yet: ask Claude for something.',
  learnEmptyOff: 'Turn it on for Claude to explain what it does.',
  learnNewer: '↓ {n} newer',
  learnCount: '{n}/{max} this session',
  k_tech: 'tech',
  k_concept: 'concept',
  k_step: 'step',
  learnWhy: 'why',
  learnToast: 'New explanation in Learn: open it with /tools learn',
  closeLearn: '✕',
  keysLearn: 'tab move · enter select · wheel scrolls · esc back to the prompt',
}

export type Phrase = keyof typeof EN

const PT: Record<Phrase, string> = {
  tabZen: 'Zen',
  tabThemes: 'Tema',
  tabMode: 'Modo',
  tabStatus: 'Status',
  close: 'esc ✕',
  keys: 'tab mover · enter escolher · roda rola · esc fechar',
  language: 'Idioma',
  on: 'Ligado',
  off: 'Desligado',
  now: 'agora',
  zenMode: 'Modo Zen',
  bandColor: 'Cor da faixa',
  colorSuffix: 'cor',
  kept: 'Atual',
  search: 'Buscar',
  themesCount: '{n} temas · clique em um para aplicar',
  themesWait: 'Baixando os temas do terminalcolors.com…',
  themesRetry: '↻ Tentar de novo',
  themesNone: 'Nenhum tema com “{q}”.',
  defaultTheme: '↺ Padrão do Claude Code',
  downloadAgain: '⟳ Baixar de novo',
  terminalDefault: 'Padrão do terminal',
  model: 'Modelo',
  modelDefault: '↺ Padrão do Claude Code',
  effort: 'Esforço',
  runningIn: 'Rodando em',
  runningUnknown: 'Aparece depois do próximo prompt',
  shiftTab: 'shift+tab troca',
  newSessions: 'Novas sessões começam em',
  bypassWarning: 'Ignorar permissões pula todas as verificações. O Claude Code pede confirmação quando a próxima sessão começar.',
  statusLine: 'Linha de status',
  statusNote: 'Ligado tira o seu comando statusLine do settings.json; Desligado coloca de volta.',
  m_default: 'perguntar',
  m_plan: 'planejar',
  m_acceptEdits: 'aceitar edições',
  m_auto: 'auto',
  m_dontAsk: 'não perguntar',
  m_bypassPermissions: 'ignorar permissões',
  tabLearn: 'Aprender',
  learnMode: 'Modo Aprender',
  learnNote: 'Ligado: o Claude explica aqui as tecnologias e os passos que escolhe. Desligado: trabalha como sempre.',
  learnEmptyOn: 'Nenhuma explicação ainda: peça algo ao Claude.',
  learnEmptyOff: 'Ligue o modo para o Claude explicar o que faz.',
  learnNewer: '↓ {n} mais recentes',
  learnCount: '{n}/{max} nesta sessão',
  k_tech: 'tecnologia',
  k_concept: 'conceito',
  k_step: 'passo',
  learnWhy: 'por quê',
  learnToast: 'Nova explicação em Aprender: abra com /tools learn',
  closeLearn: '✕',
  keysLearn: 'tab mover · enter escolher · roda rola · esc volta ao prompt',
}

const PHRASES: Record<Lang, Record<Phrase, string>> = { en: EN, pt: PT }

export const isLang = (v: unknown): v is Lang => v === 'en' || v === 'pt'

// A phrase in `lang`, each {name} filled from `vars`.
export const phrase = (lang: Lang, key: Phrase, vars: Record<string, string | number> = {}) =>
  PHRASES[lang][key].replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ''))

// A permission mode's name in `lang`: `acceptEdits` → `accept edits`.
export const modeName = (lang: Lang, mode: string | null) =>
  mode === null ? '—' : `m_${mode}` in EN ? phrase(lang, `m_${mode}` as Phrase) : mode
