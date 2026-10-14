import { describe, expect, mock, test } from 'claude-code/testing'
import type { On, PaneOpenArgs } from 'claude-code'

import {
  findProfile,
  oscFor,
  parseJsonc,
  targetProfile,
  toClaudeTheme,
  toPalette,
  toWtScheme,
  withProfileTheme,
  WT_SCHEME,
  type WtSettings,
} from '../hooks/lib/palette'
import { barCells, percentOf, stepLabel, visibleSteps } from '../hooks/lib/zen'
import { backgroundPill, barFill, cacheState, CACHE_TTL_MS, colorFor, fmtDuration, fmtTokens } from '../hooks/lib/status'
import { addNote, learnColumns, learnPrompt, MAX_NOTES, scrollNotes, toNote, visibleNotes } from '../hooks/lib/learn'

const PLUGIN = 'extra-mods'
const SURFACES = ['terminal', 'desktop'] as const

const DRACULA = `name: Dracula Default
accent: "#ff79c6"
cursor: "#ff79c6"
background: "#282a36"
foreground: "#f8f8f2"
details: darker
terminal_colors:
  bright:
    black: "#6272a4"
    blue: "#d6acff"
    cyan: "#a4ffff"
    green: "#69ff94"
    magenta: "#ff92df"
    red: "#ff6e6e"
    white: "#ffffff"
    yellow: "#ffffa5"
  normal:
    black: "#21222c"
    blue: "#bd93f9"
    cyan: "#8be9fd"
    green: "#50fa7b"
    magenta: "#ff79c6"
    red: "#ff5555"
    white: "#f8f8f2"
    yellow: "#f1fa8c"
`

const band = (bodyColumns = 80) => ({
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns, scroll: { offset: 0, bodyRows: 20 }, view: {} },
})

const pane = {
  component: 'Pane' as const,
  requestId: 'claude-tools',
  props: {
    title: 'extra-mods',
    isFocused: true,
    bodyColumns: 56,
    placement: 'dock' as const,
    scroll: { offset: 0, bodyRows: 26 },
    view: {},
  },
}

const hint = {
  component: 'PromptHint' as const,
  props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
}

describe('themes', () => {
  test('reads terminalcolors.com YAML into a palette', async () => {
    const p = toPalette(DRACULA)
    expect(p?.name).toBe('Dracula Default')
    expect(p?.background).toBe('#282a36')
    expect(p?.normal).toEqual(['#21222c', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2'])
    expect(p?.bright[7]).toBe('#ffffff')
    expect(toPalette('name: broken\n')).toBe(null)
  })

  test('maps a palette to a Claude Code theme', async () => {
    const theme = toClaudeTheme(toPalette(DRACULA)!)
    expect(theme.name).toBe('Dracula Default')
    expect(theme.base).toBe('dark')
    expect(theme.overrides.claude).toBe('#ff79c6')
    expect(theme.overrides.text).toBe('#f8f8f2')
    expect(theme.overrides.error).toBe('#ff5555')
    expect(theme.overrides.success).toBe('#50fa7b')
    expect(theme.overrides.userMessageBackground).toMatch(/^#[0-9a-f]{6}$/)
  })

  test('sets every Claude Code color token, so none falls back to the base theme', async () => {
    const { overrides } = toClaudeTheme(toPalette(DRACULA)!)
    expect(Object.keys(overrides)).toHaveLength(72)
    for (const key of ['selectionBg', 'skill', 'clawd_body', 'rate_limit_fill', 'orange_FOR_SUBAGENTS_ONLY', 'rainbow_violet_shimmer'])
      expect(overrides[key]).toMatch(/^#[0-9a-f]{6}$/)
  })

  test('maps a palette to a Windows Terminal scheme', async () => {
    const scheme = toWtScheme(toPalette(DRACULA)!)
    expect(scheme.name).toBe('Dracula Default')
    expect(scheme.purple).toBe('#ff79c6')
    expect(scheme.brightPurple).toBe('#ff92df')
    expect(scheme.cursorColor).toBe('#ff79c6')
  })

  test("parses Windows Terminal's commented settings and finds this window's profile", async () => {
    const text = `{
      // the defaults
      "profiles": { "defaults": {}, "list": [ { "guid": "{ABC}", "name": "PowerShell", }, ] },
      /* schemes */ "schemes": [],
      "url": "https://example.com//not-a-comment"
    }`
    const settings = parseJsonc(text) as WtSettings & { url: string }
    expect(settings.url).toBe('https://example.com//not-a-comment')
    targetProfile(settings, '{abc}').colorScheme = 'Dracula Default'
    expect(JSON.stringify(settings)).toContain('"colorScheme":"Dracula Default"')
    targetProfile(settings, null).colorScheme = 'Nord'
    expect((settings.profiles as { defaults: { colorScheme: string } }).defaults.colorScheme).toBe('Nord')
  })

  test("themes the profile Claude Code runs in, then gives it its own scheme back", async () => {
    const mine = { guid: '{ABC}', name: 'PowerShell', colorScheme: 'One Half Dark' }
    const other = { guid: '{DEF}', name: 'Ubuntu' }
    const settings: WtSettings = { profiles: { defaults: { colorScheme: 'CGA' }, list: [mine, other] }, schemes: [{ name: 'Mine' }] }
    const profile = findProfile(settings, '{abc}')!
    expect(profile).toBe(mine)

    withProfileTheme(settings, profile, toPalette(DRACULA), 'One Half Dark')
    expect(mine.colorScheme).toBe(WT_SCHEME)
    expect(other).toEqual({ guid: '{DEF}', name: 'Ubuntu' })
    expect(settings.schemes).toEqual([{ name: 'Mine' }, { ...toWtScheme(toPalette(DRACULA)!), name: WT_SCHEME }])

    withProfileTheme(settings, profile, null, 'One Half Dark')
    expect(mine.colorScheme).toBe('One Half Dark')
    expect(settings.schemes).toEqual([{ name: 'Mine' }])

    // A profile with no scheme of its own goes back to following the defaults.
    withProfileTheme(settings, other, toPalette(DRACULA))
    withProfileTheme(settings, other, null)
    expect(other).toEqual({ guid: '{DEF}', name: 'Ubuntu' })
  })

  test('writes OSC sequences for macOS and Linux terminals', async () => {
    const seq = oscFor(toPalette(DRACULA))
    expect(seq).toContain('\u001b]11;#282a36\u0007')
    expect(seq).toContain('\u001b]4;15;#ffffff\u0007')
    expect(oscFor(null)).toBe('\u001b]104\u0007\u001b]110\u0007\u001b]111\u0007\u001b]112\u0007')
  })
})

describe('status line', () => {
  test('formats like the old statusline script', async () => {
    expect(fmtTokens(306_000)).toBe('306k')
    expect(fmtTokens(1_000_000)).toBe('1M')
    expect(fmtDuration(110 * 60_000)).toBe('1h50m')
    expect(fmtDuration(24 * 3_600_000)).toBe('1d00h')
    expect(barFill(34)).toBe(3)
    expect(colorFor(95)).toBe('#ef4444')
  })

  test('cache is ok inside the hour and over after it', async () => {
    expect(cacheState(null, 1000)).toBe(null)
    expect(cacheState(0, CACHE_TTL_MS - 1)).toBe('ok')
    expect(cacheState(0, CACHE_TTL_MS)).toBe('over')
  })

  test("reads the engine's shell and monitor pill out of its hint", async () => {
    expect(backgroundPill('? for shortcuts')).toBe(null)
    expect(backgroundPill('1 shell · ? for shortcuts')).toBe('1 shell')
    expect(backgroundPill('esc to interrupt 2 shells, 1 monitor')).toBe('2 shells, 1 monitor')
    expect(backgroundPill('1 monitor')).toBe('1 monitor')
    expect(backgroundPill('3 background tasks · ? for shortcuts')).toBe('3 background tasks')
    expect(backgroundPill('ran 2 shell commands')).toBe(null)
  })
})

describe('zen math', () => {
  const steps = (...s: ('pending' | 'in_progress' | 'completed')[]) =>
    s.map((status, i) => ({ id: String(i), text: `step ${i}`, status }))

  test('percent and step label follow the task list', async () => {
    const t = { title: 'x', startedAt: 0, doneAt: null, steps: steps('completed', 'in_progress', 'pending', 'pending') }
    expect(percentOf(t)).toBe(25)
    expect(stepLabel(t)).toBe('Step 2 of 4')
    expect(percentOf({ ...t, steps: [] })).toBe(0)
    expect(stepLabel({ ...t, steps: [] })).toBe('Working…')
    expect(percentOf({ ...t, doneAt: 5 })).toBe(100)
  })

  test('the bar fills its width, in one color or a rainbow', async () => {
    expect(barCells('blue', '#3b82f6', 40, 50)).toEqual({ filled: 20, runs: [{ color: '#3b82f6', cells: 20 }] })
    const rainbow = barCells('rainbow', '', 40, 100)
    expect(rainbow.runs).toHaveLength(8)
    expect(rainbow.runs.reduce((n, r) => n + r.cells, 0)).toBe(40)
  })

  test('long lists keep the current step in view', async () => {
    const t = { title: 'x', startedAt: 0, doneAt: null, steps: steps(...Array(5).fill('completed'), 'in_progress', 'pending', 'pending', 'pending', 'pending') }
    const shown = visibleSteps(t)
    expect(shown).toHaveLength(6)
    expect(shown.some(s => s.status === 'in_progress')).toBe(true)
  })
})

// Stands in for the engine's own drawing where the mod passes.
const engineDraws = (on: On) => {
  mock.store(on)
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.close', () => ({ value: undefined }))
}

// A chip is chosen when its frame is drawn in the accent color.
const isChosen = async (menu: { find: (q: { key: string }) => Promise<{ props: Record<string, unknown> } | undefined> }, key: string) =>
  (await menu.find({ key: `${key}-box` }))?.props.borderColor === 'claude'

// The engine's drawing, a store the test reads back and every pane open the mod asked for.
const engineKeeps = (on: On, entries: Record<string, unknown> = {}) => {
  const kept = new Map<string, unknown>(Object.entries(entries))
  on('store.get', (_$, e) => ({ value: kept.get(e.key) }))
  on('store.set', (_$, e) => (kept.set(e.key, e.value), { value: undefined }))
  on('store.delete', (_$, e) => (kept.delete(e.key), { value: undefined }))
  on('store.keys', () => ({ value: [...kept.keys()] }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
  const opened: PaneOpenArgs[] = []
  on('ui.open', (_$, e) => (opened.push(e), { value: { isPlaced: true as const } }))
  on('ui.close', () => ({ value: undefined }))
  return { kept, opened }
}

// The prompt hint as a 200-column fullscreen terminal draws it.
const wideHint = { ...hint, viewport: { columns: 200, rows: 50, isFullscreen: true } }

const LEARN_TOOL = 'mcp__extra-mods__explain'

// What a system prompt is composed for, as the engine hands it to prompt.compose.
const COMPOSE = {
  model: 'claude-opus-5-5',
  promptModel: 'claude-opus-5-5',
  surfaces: ['terminal' as const],
  tools: [],
  outputStyle: null,
  traits: [],
}

// The engine's own description of the explain tool, before the mod places it.
const EXPLAIN_DESCRIBED = { tool: LEARN_TOOL, description: 'Posts a short explanation.', provider: { plugin: 'extra-mods', tier: 'user' } }

describe('toolbox', () => {
  test('the corner button opens the menu in its pane', async ($, on) => {
    engineDraws(on)
    for (const surface of SURFACES) {
      const corner = await $.ui.mount({ plugin: PLUGIN, surface, ...hint })
      const menu = await $.ui.mount({ plugin: PLUGIN, surface, ...pane })
      expect((await corner.find({ key: 'tools-toggle' }))?.text).toMatch(/extra-mods ▲/)
      expect(await menu.find({ key: 'tab-zen' })).toBeUndefined()

      await corner.press({ key: 'tools-toggle' })
      expect((await corner.find({ key: 'tools-toggle' }))?.text).toMatch(/▼/)
      for (const key of ['tab-zen', 'tab-themes', 'tab-mode', 'tab-status', 'tab-learn', 'tools-close', 'lang-pt']) {
        expect(await menu.find({ key })).toBeDefined()
      }
      await corner.press({ key: 'tools-toggle' })
      await corner.unmount()
      await menu.unmount()
    }
  })

  test('Zen mode and its band color are set from the menu', async ($, on) => {
    engineDraws(on)
    const surface = 'terminal'
    const corner = await $.ui.mount({ plugin: PLUGIN, surface, ...hint })
    const menu = await $.ui.mount({ plugin: PLUGIN, surface, ...pane })
    await corner.press({ key: 'tools-toggle' })
    await menu.press({ key: 'zen-on' })
    await menu.press({ key: 'zen-theme-rainbow' })
    expect(await isChosen(menu, 'zen-on')).toBe(true)
    expect((await menu.find({ key: 'zen-theme-rainbow' }))?.text).toMatch(/rainbow ✓/)

    await menu.press({ key: 'tab-mode' })
    await menu.press({ key: 'tab-zen' })
    expect((await menu.find({ key: 'zen-theme-rainbow' }))?.text).toMatch(/rainbow ✓/)
    await menu.press({ key: 'zen-off' })
    expect(await isChosen(menu, 'zen-off')).toBe(true)
  })

  test('the mode page lists effort levels and new-session modes', async ($, on) => {
    engineDraws(on)
    const menu = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...pane })
    const corner = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...hint })
    await corner.press({ key: 'tools-toggle' })
    await menu.press({ key: 'tab-mode' })
    for (const level of ['low', 'medium', 'high', 'xhigh', 'max']) {
      expect(await menu.find({ key: `effort-${level}` })).toBeDefined()
    }
    expect((await menu.find({ key: 'default-mode-bypassPermissions' }))?.text).toMatch(/bypass permissions/)
    await menu.press({ key: 'effort-high' })
    // The chosen level is drawn as a filled chip, padded; max as ✦ and a rainbow.
    expect((await menu.find({ key: 'effort-high' }))?.text).toBe(' high ')
    await menu.press({ key: 'effort-max' })
    expect((await menu.find({ key: 'effort-max' }))?.text).toBe('✦ max')
  })

  test('the mode page switches the model through /model', async ($, on) => {
    engineDraws(on)
    let current = 'claude-opus-5-5'
    const ran: string[] = []
    on('command.run', { command: 'model' }, async (_$, e) => {
      ran.push(e.args)
      current = e.args === 'sonnet' ? 'claude-sonnet-5-5' : current
      return { text: `Set model to ${e.args}` }
    })
    on('session.model', () => ({ value: current }))
    const menu = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...pane })
    const corner = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...hint })
    await corner.press({ key: 'tools-toggle' })
    await menu.press({ key: 'tab-mode' })
    for (const alias of ['fable', 'opus', 'sonnet', 'haiku', 'default']) {
      expect(await menu.find({ key: `model-${alias}` })).toBeDefined()
    }
    await menu.press({ key: 'model-sonnet' })
    expect(ran).toEqual(['sonnet'])
    expect(await isChosen(menu, 'model-sonnet')).toBe(true)
  })

  test('a running shell or monitor gets a second row under the status line', async ($, on) => {
    engineDraws(on)
    const ran: string[] = []
    on('command.run', { command: 'tasks' }, async (_$, e) => {
      ran.push(e.command)
      return { text: '' }
    })
    const busy = { ...hint, props: { ...hint.props, hint: '1 shell, 1 monitor · ? for shortcuts' } }
    // The status line, turned on from the menu over an empty settings.json.
    on('env.get', () => ({ value: '/home/me' }))
    on('fs.exists', () => ({ value: false }))
    on('fs.write', () => ({ value: undefined }))
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('session.cwd', () => ({ value: '/work/ClaudeMods' }))
    on('session.usage', () => ({
      value: { context: { percent: 12, tokens: 24_000, window: 200_000 }, rateLimits: [] },
    }) as never)
    on('process.run', () => ({ value: { exitCode: 0, stdout: 'main\n', stderr: '' } }) as never)
    const menu = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...pane })
    const opener = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...hint })
    await opener.press({ key: 'tools-toggle' })
    await menu.press({ key: 'tab-status' })
    await menu.press({ key: 'status-on' })
    await opener.press({ key: 'tools-toggle' })
    await opener.unmount()
    await menu.unmount()
    const idle = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...hint })
    expect(await idle.find({ key: 'background-tasks' })).toBeUndefined()
    await idle.unmount()

    const corner = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...busy })
    expect((await corner.find({ key: 'background-tasks' }))?.text).toMatch(/1 shell, 1 monitor/)
    expect(await corner.find({ text: /Opus 5\.5 · ClaudeMods/ })).toBeDefined()
    expect(await corner.find({ key: 'tools-toggle' })).toBeDefined()
    await corner.press({ key: 'background-tasks' })
    expect(ran).toEqual(['tasks'])
  })

  test('a /clear closes the menu and brings back the kept Zen mode, effort and model', async ($, on) => {
    // The session after a /clear: every value at its default, the store as it was kept.
    mock.store(on, { zenOn: true, zenTheme: 'rainbow', effort: 'medium', statusOn: false })
    on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
    on('ui.open', () => ({ value: { isPlaced: true as const } }))
    const closed: string[] = []
    on('ui.close', (_$, e) => (closed.push(e.id), { value: undefined }))
    on('env.get', () => ({ value: '/home/me' }))
    on('fs.exists', () => ({ value: false }))
    on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
    on('classic.SessionStart', () => ({}))
    const menu = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...pane })
    const corner = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...hint })
    await corner.press({ key: 'tools-toggle' })
    expect(await isChosen(menu, 'zen-off')).toBe(true)

    await $.classic.SessionStart({ source: 'clear' })
    expect(closed).toEqual(['claude-tools'])
    await corner.press({ key: 'tools-toggle' })
    expect(await isChosen(menu, 'zen-on')).toBe(true)
    expect((await menu.find({ key: 'zen-theme-rainbow' }))?.text).toMatch(/rainbow ✓/)
    await menu.press({ key: 'tab-mode' })
    expect((await menu.find({ key: 'effort-medium' }))?.text).toBe(' medium ')
    expect(await isChosen(menu, 'model-sonnet')).toBe(true)
  })

  test('the language row switches the panel to Portuguese and back', async ($, on) => {
    engineDraws(on)
    const menu = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...pane })
    const corner = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...hint })
    await corner.press({ key: 'tools-toggle' })
    expect((await menu.find({ key: 'zen-on' }))?.text).toMatch(/On/)
    await menu.press({ key: 'lang-pt' })
    expect((await menu.find({ key: 'tab-themes' }))?.text).toMatch(/Tema/)
    expect((await menu.find({ key: 'zen-on' }))?.text).toMatch(/Ligado/)
    await menu.press({ key: 'tab-mode' })
    expect((await menu.find({ key: 'default-mode-bypassPermissions' }))?.text).toMatch(/ignorar permissões/)
    await menu.press({ key: 'lang-en' })
    expect((await menu.find({ key: 'tab-themes' }))?.text).toMatch(/Theme/)
  })

  test('the themes page keeps the language row in view and paints the pane on a click', async ($, on) => {
    mock.store(on, { statusOn: false })
    on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
    on('ui.open', () => ({ value: { isPlaced: true as const } }))
    on('ui.close', () => ({ value: undefined }))
    // Forty saved themes, each Dracula under another name and background.
    const names = Array.from({ length: 40 }, (_, i) => `theme-${String(i).padStart(2, '0')}`)
    const yaml = (slug: string) =>
      DRACULA.replace('Dracula Default', slug).replace('background: "#282a36"', `background: "#0000${slug.slice(-2)}"`)
    on('env.get', (_$, { name }) => ({ value: name === 'HOME' ? '/home/me' : undefined }))
    on('fs.exists', () => ({ value: true }))
    on('fs.list', () => ({ value: names.map(n => ({ name: `${n}.yaml`, kind: 'file' as const, size: 1, mtimeMs: 0 })) }) as never)
    on('fs.read', (_$, { path }) => ({
      value: path.endsWith('.yaml') ? yaml(path.split('/').pop()!.replace('.yaml', '')) : '{"theme":"custom:extra-mods"}',
    }))
    on('fs.write', () => ({ value: undefined }))
    on('config.list', () => ({ value: [{ key: 'theme', kind: 'enum', value: 'custom:extra-mods', options: ['dark', 'custom:extra-mods'] }] }) as never)
    on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '' } }) as never)
    on('classic.SessionStart', () => ({}))
    // A /clear restores the kept settings, the saved themes among them.
    await $.classic.SessionStart({ source: 'clear' })

    const menu = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...pane })
    const corner = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...hint })
    await corner.press({ key: 'tools-toggle' })
    await menu.press({ key: 'tab-themes' })
    const shown = (await menu.findAll({ type: 'Button' })).filter(b => b.key?.startsWith('theme:'))
    expect(shown.length).toBeGreaterThan(0)
    expect(shown.length).toBeLessThan(pane.props.scroll.bodyRows)
    expect(await menu.find({ key: 'lang-pt' })).toBeDefined()

    await menu.press({ key: 'theme:theme-03' })
    expect((await menu.find({ key: 'theme:theme-03' }))?.text).toMatch(/theme-03 ✓/)
    expect(await menu.drawn()).toMatchObject({ props: { backgroundColor: '#000003' } })
  })

  test("Claude's zen_progress calls fill the band", async ($, on) => {
    engineDraws(on)
    mock.clock(on)
    const corner = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...hint })
    const menu = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...pane })
    const progress = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...band() })
    await corner.press({ key: 'tools-toggle' })
    await menu.press({ key: 'zen-on' })

    await $.tool.call({
      tool: 'mcp__extra-mods__zen_progress',
      title: 'Build the dashboard',
      steps: [
        { text: 'Plan', status: 'completed' },
        { text: 'Fetch data', status: 'in_progress' },
        { text: 'Draw charts', status: 'pending' },
        { text: 'Test', status: 'completed' },
      ],
    } as never)
    expect(await progress.find({ text: /Build the dashboard/ })).toBeDefined()
    expect(await progress.find({ text: /50%/ })).toBeDefined()
    expect(await progress.find({ text: /Step 2 of 4/ })).toBeDefined()
    expect(await progress.find({ text: /Fetch data/ })).toBeDefined()
  })
})

describe('learn notes', () => {
  test('reads the explain input into a note', async () => {
    expect(toNote({ title: ' Vite ', text: 'A fast dev server.', kind: 'tech' }, 'n1', 5)).toEqual({
      note: { id: 'n1', title: 'Vite', text: 'A fast dev server.', kind: 'tech', at: 5 },
    })
    expect(toNote({ title: 'MVC', text: 'Splits the app.' }, 'n2', 0)).toMatchObject({ note: { kind: 'concept' } })
    expect(toNote({ title: 'MVC', text: 'x', kind: 'weird' }, 'n3', 0)).toMatchObject({ note: { kind: 'concept' } })
  })

  test('cuts long titles and texts with an ellipsis', async () => {
    const made = toNote({ title: 'T'.repeat(200), text: 'x'.repeat(1000) }, 'n', 0)
    if (!('note' in made)) throw new Error('expected a note')
    expect(made.note.title).toHaveLength(80)
    expect(made.note.title.endsWith('…')).toBe(true)
    expect(made.note.text).toHaveLength(600)
    expect(made.note.text.endsWith('…')).toBe(true)
  })

  test('refuses a missing or empty title or text', async () => {
    expect(toNote({ text: 'x' }, 'n', 0)).toEqual({ error: 'explain needs a non-empty title.' })
    expect(toNote({ title: '  ', text: '' }, 'n', 0)).toEqual({ error: 'explain needs a non-empty title and text.' })
    expect(toNote(undefined, 'n', 0)).toEqual({ error: 'explain needs a non-empty title and text.' })
  })

  test('keeps the newest notes, in order', async () => {
    let list: ReturnType<typeof addNote> = []
    for (let i = 0; i < MAX_NOTES + 5; i++) list = addNote(list, { id: `n${i}`, title: 't', text: 'x', kind: 'step', at: i })
    expect(list).toHaveLength(MAX_NOTES)
    expect(list[0]?.id).toBe('n5')
    expect(list.at(-1)?.id).toBe(`n${MAX_NOTES + 4}`)
  })

  test('asks for 40% of the terminal, never under 56 columns', async () => {
    expect(learnColumns(200)).toBe(80)
    expect(learnColumns(100)).toBe(56)
    expect(learnColumns(0)).toBe(56)
  })

  test('the wheel walks back through older notes and returns to the newest', async () => {
    const notes = ['a', 'b', 'c'].map((id, at) => ({ id, title: id, text: id, kind: 'step' as const, at }))
    expect(visibleNotes(notes, 0).map(n => n.id)).toEqual(['a', 'b', 'c'])
    expect(visibleNotes(notes, 2).map(n => n.id)).toEqual(['a'])
    expect(visibleNotes([], 0)).toEqual([])
    expect(scrollNotes(0, -1, 3)).toBe(1)
    expect(scrollNotes(2, -3, 3)).toBe(2)
    expect(scrollNotes(1, 1, 3)).toBe(0)
    expect(scrollNotes(0, 1, 3)).toBe(0)
    expect(scrollNotes(0, -1, 0)).toBe(0)
    expect(scrollNotes(1, 0, 3)).toBe(1)
  })

  test("the instruction for Claude speaks the panel's language and names the tool", async () => {
    expect(learnPrompt('pt')).toMatch(/mcp__extra-mods__explain/)
    expect(learnPrompt('pt')).toMatch(/em português/)
    expect(learnPrompt('en')).toMatch(/mcp__extra-mods__explain/)
    expect(learnPrompt('en')).toMatch(/in English/)
  })
})

describe('learn tab', () => {
  test('the Learn tab turns learn mode on and keeps it for later sessions', async ($, on) => {
    const { kept } = engineKeeps(on)
    for (const surface of SURFACES) {
      const corner = await $.ui.mount({ plugin: PLUGIN, surface, ...hint })
      const menu = await $.ui.mount({ plugin: PLUGIN, surface, ...pane })
      await corner.press({ key: 'tools-toggle' })
      await menu.press({ key: 'tab-learn' })
      expect(await isChosen(menu, 'learn-off')).toBe(true)
      expect(await menu.find({ text: /Turn it on for Claude/ })).toBeDefined()
      await menu.press({ key: 'learn-on' })
      expect(await isChosen(menu, 'learn-on')).toBe(true)
      expect(kept.get('learnOn')).toBe(true)
      expect(await menu.find({ text: /No explanations yet/ })).toBeDefined()
      await menu.press({ key: 'learn-off' })
      expect(kept.get('learnOn')).toBe(false)
      await corner.press({ key: 'tools-toggle' })
      await corner.unmount()
      await menu.unmount()
    }
  })

  test('the Learn tab opens wide and stays open on Esc; the other tabs as before', async ($, on) => {
    const { opened } = engineKeeps(on)
    const corner = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...wideHint })
    const menu = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...pane })
    await corner.press({ key: 'tools-toggle' })
    expect(opened.at(-1)).toMatchObject({ id: 'claude-tools', columns: 56, closeOnEscape: true, focus: true })
    await menu.press({ key: 'tab-learn' })
    expect(opened.at(-1)).toMatchObject({ id: 'claude-tools', columns: 80 })
    expect(opened.at(-1)?.closeOnEscape).toBeUndefined()
    await menu.press({ key: 'tab-zen' })
    expect(opened.at(-1)).toMatchObject({ columns: 56, closeOnEscape: true })
  })

  test('/tools learn opens the menu on the Learn tab', async ($, on) => {
    const { opened } = engineKeeps(on)
    const menu = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...pane })
    // The kit's $ takes the command's whole input; the engine stamps origin and presentation.
    await $.command.run({ command: 'tools', args: 'learn' } as never)
    expect(await menu.find({ key: 'learn-on' })).toBeDefined()
    expect(opened.at(-1)?.closeOnEscape).toBeUndefined()
    expect(opened.at(-1)?.columns).toBeGreaterThanOrEqual(56)
  })

  test("while learn mode is on, Claude's prompt asks for explanations and lists the tool", async ($, on) => {
    engineKeeps(on)
    on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude Code.', scope: 'shared' as const }] }))
    on('tool.describe', (_$, e) => ({ description: e.description }))
    const compose = async () => (await $.prompt.compose(COMPOSE)).sections
    const deferred = async () => (await $.tool.describe(EXPLAIN_DESCRIBED as never)).isDeferred
    const corner = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...hint })
    const menu = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...pane })
    expect((await compose()).map(s => s.id)).toEqual(['intro'])
    expect(await deferred()).toBe(true)

    await corner.press({ key: 'tools-toggle' })
    await menu.press({ key: 'tab-learn' })
    await menu.press({ key: 'learn-on' })
    const section = (await compose()).at(-1)
    expect(section).toMatchObject({ id: 'extra-mods:learn', scope: 'session' })
    expect(section?.text).toMatch(/in English/)
    expect(await deferred()).toBe(false)

    await menu.press({ key: 'lang-pt' })
    expect((await compose()).at(-1)?.text).toMatch(/em português/)

    await menu.press({ key: 'learn-off' })
    expect((await compose()).map(s => s.id)).toEqual(['intro'])
    expect(await deferred()).toBe(true)
  })

  test("Claude's explain calls fill the Learn tab and open it beside the work", async ($, on) => {
    const { opened } = engineKeeps(on)
    const corner = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...wideHint })
    const menu = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...pane })
    await corner.press({ key: 'tools-toggle' })
    await menu.press({ key: 'tab-learn' })
    await menu.press({ key: 'learn-on' })
    await corner.press({ key: 'tools-toggle' })

    const answered = await $.tool.call({ tool: LEARN_TOOL, title: 'Vite', text: 'A dev server that reloads `instantly`.', kind: 'tech' } as never)
    expect(answered).toMatchObject({ result: 'Explicação mostrada no painel (1 nesta sessão).' })
    expect(opened.at(-1)).toMatchObject({ id: 'claude-tools', columns: 80 })
    expect(opened.at(-1)?.focus).toBeUndefined()
    expect(await menu.find({ text: /\[tech\]/ })).toBeDefined()
    expect(await menu.find({ text: /Vite/ })).toBeDefined()
    expect((await menu.find({ type: 'Markdown' }))?.props.text).toMatch(/reloads/)

    // A call missing its title is refused and keeps nothing.
    const refused = await $.tool.call({ tool: LEARN_TOOL, text: 'no title' } as never)
    expect(refused).toMatchObject({ deny: 'explain needs a non-empty title.' })
    expect(await menu.findAll({ type: 'Markdown' })).toHaveLength(1)

    // The labels follow the panel's language; the note keeps Claude's words.
    await menu.press({ key: 'lang-pt' })
    expect(await menu.find({ text: /\[tecnologia\]/ })).toBeDefined()
    expect((await menu.find({ type: 'Markdown' }))?.props.text).toMatch(/reloads/)
  })

  test('with learn mode off a call is kept but the menu stays closed', async ($, on) => {
    const { opened } = engineKeeps(on)
    const menu = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...pane })
    const answered = await $.tool.call({ tool: LEARN_TOOL, title: 'npm', text: 'Installs packages.' } as never)
    expect(answered).toMatchObject({ result: 'Explicação mostrada no painel (1 nesta sessão).' })
    expect(opened).toHaveLength(0)
    expect(await menu.find({ key: 'learn-on' })).toBeUndefined()
  })

  test('on a terminal too narrow for the pane, a new explanation says once how to open it', async ($, on) => {
    mock.store(on)
    on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
    on('ui.open', () => ({ value: { isPlaced: false as const, reason: 'under 144 columns' } }))
    on('ui.close', () => ({ value: undefined }))
    const toasts: string[] = []
    on('ui.toast', (_$, e) => (toasts.push(e.text), { value: undefined }))
    const corner = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...hint })
    const menu = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...pane })
    await corner.press({ key: 'tools-toggle' })
    await menu.press({ key: 'tab-learn' })
    await menu.press({ key: 'learn-on' })
    await menu.press({ key: 'lang-pt' })
    await corner.press({ key: 'tools-toggle' })

    await $.tool.call({ tool: LEARN_TOOL, title: 'Vite', text: 'A dev server.' } as never)
    // The waiting pane closed again, so the next explanation tries to open it again.
    await corner.press({ key: 'tools-toggle' })
    await $.tool.call({ tool: LEARN_TOOL, title: 'React', text: 'A UI library.' } as never)
    expect(toasts.filter(t => t.includes('Nova explicação em Aprender'))).toHaveLength(1)
  })
})
