import { describe, expect, mock, test, type Engine } from 'claude-code/testing'
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
import { tabStripRows } from '../hooks/lib/layout'
import { barCells, percentOf, stepLabel, visibleSteps } from '../hooks/lib/zen'
import { backgroundPill, barFill, cacheState, CACHE_TTL_MS, colorFor, fmtDuration, fmtTokens } from '../hooks/lib/status'
import {
  addNote,
  askHeading,
  askLine,
  fitNotes,
  freshNotes,
  learnAnswer,
  learnColumns,
  learnPrompt,
  learnRows,
  LEARN_LIMIT,
  LEARN_TOOL_DESCRIPTION,
  MAX_EXPLAIN,
  MAX_NOTES,
  MAX_PER_CALL,
  nextAsk,
  noteRows,
  scrollNotes,
  toNote,
  toNotes,
  underLimit,
} from '../hooks/lib/learn'

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

// The menu's pane drawn on the terminal and on the desktop at once, over the
// same state: the test acts on the first and reads both. `bodyRows` tall.
const mountMenus = async ($: Engine, bodyRows = 26) => {
  const props = { ...pane.props, scroll: { offset: 0, bodyRows } }
  const [terminal, desktop] = await Promise.all(SURFACES.map(surface => $.ui.mount({ plugin: PLUGIN, surface, ...pane, props })))
  return [terminal!, desktop!] as const
}

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

  test("the desktop draws the pane on its own background, in its own theme's text", async ($, on) => {
    engineDraws(on)
    const corner = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...hint })
    const menu = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...pane })
    await corner.press({ key: 'tools-toggle' })
    for (const tab of ['tab-zen', 'tab-themes', 'tab-mode', 'tab-status', 'tab-learn']) {
      await menu.press({ key: tab })
      const drawn = await menu.drawn()
      expect(drawn).toMatchObject({ type: 'Box' })
      expect(drawn?.type === 'Box' ? drawn.props?.backgroundColor : 'not a Box').toBeUndefined()
    }
  })

  test('the desktop frames the chosen tab as a chip, not in box-drawing glyphs', async ($, on) => {
    engineDraws(on)
    const corner = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...hint })
    const menu = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...pane })
    await corner.press({ key: 'tools-toggle' })
    await menu.press({ key: 'tab-learn' })
    expect(await isChosen(menu, 'tab-learn')).toBe(true)
    expect(await isChosen(menu, 'tab-zen')).toBe(false)
    expect(await menu.find({ text: /[╭╮╯╰│]/ })).toBeUndefined()
    // The terminal keeps its folder tabs.
    const terminal = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...pane })
    expect(await terminal.find({ text: /╭/ })).toBeDefined()
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
    expect(toNote({ title: 'Vite', text: 'A dev server.', why: ' Fast reloads. ' }, 'n4', 0)).toMatchObject({ note: { why: 'Fast reloads.' } })
    const made = toNote({ title: 'Vite', text: 'A dev server.', why: '  ' }, 'n5', 0)
    expect('note' in made && 'why' in made.note).toBe(false)
  })

  test('reads a list of notes in one call, and one note given alone', async () => {
    expect(toNotes({ notes: [{ title: 'Vite', text: 'A dev server.' }, { title: 'React', text: 'A UI library.' }] }, 'c', 1)).toEqual({
      notes: [
        { id: 'c:0', title: 'Vite', text: 'A dev server.', kind: 'concept', at: 1 },
        { id: 'c:1', title: 'React', text: 'A UI library.', kind: 'concept', at: 1 },
      ],
      errors: [],
    })
    expect(toNotes({ notes: [{ title: 'Vite', text: 'A dev server.' }] }, 'c', 1).notes[0]?.id).toBe('c')
    expect(toNotes({ title: 'Vite', text: 'A dev server.' }, 'c', 1).notes[0]?.id).toBe('c')
    // A list sent as JSON text reads the same.
    expect(toNotes({ notes: JSON.stringify([{ title: 'Vite', text: 'x' }, { title: 'Bun', text: 'y' }]) }, 'c', 1).notes).toHaveLength(2)
  })

  test('keeps the whole notes of a call and says which it skipped', async () => {
    expect(toNotes({ notes: [{ title: 'Vite', text: 'ok' }, { text: 'no title' }] }, 'c', 0)).toMatchObject({
      notes: [{ title: 'Vite' }],
      errors: ['note 2: explain needs a non-empty title.'],
    })
    expect(toNotes({ notes: [] }, 'c', 0)).toEqual({ notes: [], errors: ['explain needs at least one note.'] })
    const many = Array.from({ length: MAX_PER_CALL + 3 }, (_, i) => ({ title: `t${i}`, text: 'x' }))
    expect(toNotes({ notes: many }, 'c', 0).notes).toHaveLength(MAX_PER_CALL)
  })

  test('cuts long titles and texts with an ellipsis', async () => {
    const made = toNote({ title: 'T'.repeat(200), text: 'x'.repeat(1000) }, 'n', 0)
    if (!('note' in made)) throw new Error('expected a note')
    expect(made.note.title).toHaveLength(40)
    expect(made.note.title.endsWith('…')).toBe(true)
    expect(made.note.text).toHaveLength(300)
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
    expect(fitNotes(notes, 0, 20, 54).shown.map(n => n.id)).toEqual(['a', 'b', 'c'])
    expect(fitNotes(notes, 2, 20, 54).shown.map(n => n.id)).toEqual(['a'])
    expect(scrollNotes(0, -1, 3)).toBe(1)
    expect(scrollNotes(2, -3, 3)).toBe(2)
    expect(scrollNotes(1, 1, 3)).toBe(0)
    expect(scrollNotes(0, 1, 3)).toBe(0)
    expect(scrollNotes(0, -1, 0)).toBe(0)
    expect(scrollNotes(1, 0, 3)).toBe(1)
  })

  test("a note's card takes its border, its title, its wrapped text and its why in rows", async () => {
    const note = (title: string, text: string, why?: string) => ({ id: 'n', title, text, kind: 'tech' as const, at: 0, ...(why === undefined ? {} : { why }) })
    // 54 cells less the card's border and padding leave 50.
    expect(noteRows(note('Vite', 'A dev server.'), 54)).toBe(2 + 1 + 1)
    expect(noteRows(note('Vite', 'x'.repeat(300)), 54)).toBe(2 + 1 + 6)
    expect(noteRows(note('Vite', 'one\n\ntwo'), 54)).toBe(2 + 1 + 3)
    expect(noteRows(note('Vite', 'A dev server.', 'Fast.'), 54)).toBe(2 + 1 + 1 + 1)
    expect(noteRows(note('Vite', 'A dev server.', 'x'.repeat(40)), 54)).toBe(2 + 1 + 1 + 2)
  })

  test('the list draws the newest notes that fit, and shows the top of one too tall', async () => {
    const notes = Array.from({ length: 30 }, (_, i) => ({ id: `n${i}`, title: 't', text: 'short', kind: 'step' as const, at: i }))
    const fit = fitNotes(notes, 0, 10, 54)
    expect(fit.shown.map(n => n.id)).toEqual(['n28', 'n29'])
    expect(fit.isTall).toBe(false)
    expect(fitNotes(notes, 2, 10, 54).shown.map(n => n.id)).toEqual(['n26', 'n27'])
    const big = { id: 'big', title: 'Big', text: 'line\n'.repeat(10), kind: 'tech' as const, at: 99 }
    expect(fitNotes([...notes, big], 0, 10, 54)).toEqual({ shown: [big], isTall: true })
    expect(fitNotes([], 0, 10, 54)).toEqual({ shown: [], isTall: false })
  })

  test('a note already shown, by title, is not shown again', async () => {
    const note = (id: string, title: string) => ({ id, title, text: 'x', kind: 'tech' as const, at: 0 })
    const { fresh, repeated } = freshNotes([note('a', 'Vite')], [note('b', ' vite '), note('c', 'React'), note('d', 'react')])
    expect(fresh.map(n => n.id)).toEqual(['c'])
    expect(repeated).toEqual([' vite ', 'react'])
    expect(learnAnswer([], [])).toBe('ok')
    expect(learnAnswer(['note 2: x.'], ['Vite', 'React'])).toBe('ok; skipped note 2: x.; already shown: Vite, React')
  })

  test('a session takes ten notes: the ones past them are left out and said', async () => {
    const note = (title: string) => ({ id: title, title, text: 'x', kind: 'tech' as const, at: 0 })
    expect(MAX_EXPLAIN).toBe(10)
    expect(underLimit(8, [note('a'), note('b'), note('c')])).toEqual({ kept: [note('a'), note('b')], over: ['c'] })
    expect(underLimit(10, [note('a')])).toEqual({ kept: [], over: ['a'] })
    expect(learnAnswer([], [], ['c'])).toBe('ok; over the limit of 10 a session: c')
    expect(LEARN_TOOL_DESCRIPTION).toMatch(/10 a session/)
    expect(LEARN_LIMIT).toMatch(/limit of 10 explanations/)
  })

  test('each typed request is numbered and headed by its first line', async () => {
    expect(nextAsk(null, 'add a login\nwith JWT')).toEqual({ n: 1, text: 'add a login' })
    expect(nextAsk({ n: 4, text: 'x' }, 'y'.repeat(200))).toMatchObject({ n: 5, text: `${'y'.repeat(79)}…` })
    expect(askLine({ n: 1, text: 'add a login' }, 30)).toBe(`── add a login ${'─'.repeat(15)}`)
    expect(askLine({ n: 1, text: 'z'.repeat(100) }, 30)).toHaveLength(30)
  })

  test("the list heads each request's notes, and counts the heading's row", async () => {
    const ask = (n: number) => ({ n, text: `ask ${n}` })
    const note = (id: string, a?: number) => ({ id, title: 't', text: 'short', kind: 'step' as const, at: 0, ...(a === undefined ? {} : { ask: ask(a) }) })
    const shown = [note('a'), note('b', 1), note('c', 1), note('d', 2)]
    expect(shown.map((_, i) => askHeading(shown, i)?.n ?? null)).toEqual([null, 1, null, 2])
    // The first note shown always carries its request's heading.
    expect(askHeading([note('c', 1)], 0)?.n).toBe(1)
    // Four-row cards: 9 rows fit two of one request under its heading...
    expect(fitNotes([note('a', 1), note('b', 1), note('c', 1)], 0, 9, 54).shown.map(n => n.id)).toEqual(['b', 'c'])
    // ...but only one when they are two requests, each with its heading.
    expect(fitNotes([note('a', 1), note('b', 1), note('c', 2)], 0, 9, 54).shown.map(n => n.id)).toEqual(['c'])
  })

  test('the list gets the rows the rest of the page leaves it', async () => {
    expect(learnRows(26, 2, false)).toBe(9)
    expect(learnRows(26, 2, true)).toBe(8)
    expect(learnRows(10, 2, false)).toBe(3)
    // A taller tab strip, as the desktop's, leaves the list that much less.
    expect(learnRows(26, 2, false, 4)).toBe(8)
  })

  test("the tab strip's rows: three on the terminal, the desktop's framed chips and their wrap", async () => {
    const en = ['Zen', 'Theme', 'Mode', 'Status', 'Learn']
    const pt = ['Zen', 'Tema', 'Modo', 'Status', 'Aprender']
    expect(tabStripRows('terminal', pt, 'esc ✕', 20)).toBe(3)
    // One row of chips (3) and the rule.
    expect(tabStripRows('desktop', en, '✕', 54)).toBe(4)
    expect(tabStripRows('desktop', pt, '✕', 54)).toBe(4)
    // In Portuguese "esc ✕" no longer fits beside the chips: it drops to a row of its own.
    expect(tabStripRows('desktop', en, 'esc ✕', 54)).toBe(4)
    expect(tabStripRows('desktop', pt, 'esc ✕', 54)).toBe(5)
    // Narrow, the chips themselves wrap.
    expect(tabStripRows('desktop', en, '✕', 30)).toBe(3 + 3 + 1)
  })

  test("the instruction for Claude speaks the panel's language and names the tool", async () => {
    expect(learnPrompt('pt')).toMatch(/mcp__extra-mods__explain/)
    expect(learnPrompt('pt')).toMatch(/em português/)
    expect(learnPrompt('en')).toMatch(/mcp__extra-mods__explain/)
    expect(learnPrompt('en')).toMatch(/in English/)
  })

  test('the rules are said once, in the tool, and the prompt section stays one line', async () => {
    expect(LEARN_TOOL_DESCRIPTION).toMatch(/same response/)
    expect(LEARN_TOOL_DESCRIPTION).toMatch(/one call/)
    for (const lang of ['en', 'pt'] as const) expect(learnPrompt(lang).length).toBeLessThan(200)
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

  test("the Learn tab does not promise that Esc closes it", async ($, on) => {
    engineKeeps(on)
    const corner = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...hint })
    const menu = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...pane })
    await corner.press({ key: 'tools-toggle' })
    expect((await menu.find({ key: 'tools-close' }))?.text).toMatch(/esc/)
    expect(await menu.find({ text: /esc close/ })).toBeDefined()
    await menu.press({ key: 'tab-learn' })
    expect((await menu.find({ key: 'tools-close' }))?.text).not.toMatch(/esc/)
    expect(await menu.find({ text: /esc close/ })).toBeUndefined()
    expect(await menu.find({ text: /esc back to the prompt/ })).toBeDefined()
    await menu.press({ key: 'lang-pt' })
    expect(await menu.find({ text: /esc volta ao prompt/ })).toBeDefined()
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
    const menus = await mountMenus($)
    const [menu] = menus
    await corner.press({ key: 'tools-toggle' })
    await menu.press({ key: 'tab-learn' })
    await menu.press({ key: 'learn-on' })
    await corner.press({ key: 'tools-toggle' })

    const answered = await $.tool.call({ tool: LEARN_TOOL, title: 'Vite', text: 'A dev server that reloads `instantly`.', kind: 'tech' } as never)
    expect(answered).toMatchObject({ result: 'ok' })
    expect(opened.at(-1)).toMatchObject({ id: 'claude-tools', columns: 80 })
    expect(opened.at(-1)?.focus).toBeUndefined()
    for (const m of menus) {
      expect(await m.find({ text: /● tech/ })).toBeDefined()
      // Each note is a card framed in its kind's color.
      const cards = (await m.findAll({ type: 'Box' })).filter(b => b.props.borderColor === '#06b6d4')
      expect(cards).toHaveLength(1)
      expect(cards[0]?.props.borderStyle).toBe('round')
      expect(await m.find({ text: /Vite/ })).toBeDefined()
      expect((await m.find({ type: 'Markdown' }))?.props.text).toMatch(/reloads/)
    }

    // A call missing its title is refused and keeps nothing.
    const refused = await $.tool.call({ tool: LEARN_TOOL, text: 'no title' } as never)
    expect(refused).toMatchObject({ deny: 'explain needs a non-empty title.' })
    for (const m of menus) expect(await m.findAll({ type: 'Markdown' })).toHaveLength(1)

    // The labels follow the panel's language; the note keeps Claude's words.
    await menu.press({ key: 'lang-pt' })
    for (const m of menus) {
      expect(await m.find({ text: /● tecnologia/ })).toBeDefined()
      expect((await m.find({ type: 'Markdown' }))?.props.text).toMatch(/reloads/)
    }
  })

  test('one explain call posts several notes, each why on its own line', async ($, on) => {
    engineKeeps(on)
    const corner = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...wideHint })
    // A 40-row pane, so both notes fit on the desktop too.
    const menus = await mountMenus($, 40)
    const [menu] = menus
    await corner.press({ key: 'tools-toggle' })
    await menu.press({ key: 'tab-learn' })
    await menu.press({ key: 'learn-on' })

    const notes = [
      { title: 'Vite', text: 'A dev server.', why: 'It reloads fast.', kind: 'tech' },
      { title: 'Bun', text: 'Runs the tests.' },
      { text: 'no title' },
    ]
    expect(await $.tool.call({ tool: LEARN_TOOL, notes } as never)).toMatchObject({ result: 'ok; skipped note 3: explain needs a non-empty title.' })
    for (const m of menus) {
      expect(await m.findAll({ type: 'Markdown' })).toHaveLength(2)
      expect(await m.find({ text: /→ why: / })).toBeDefined()
      expect(await m.find({ text: /It reloads fast/ })).toBeDefined()
    }
    await menu.press({ key: 'lang-pt' })
    for (const m of menus) expect(await m.find({ text: /→ por quê: / })).toBeDefined()

    expect(await $.tool.call({ tool: LEARN_TOOL, notes: [] } as never)).toMatchObject({ deny: 'explain needs at least one note.' })
  })

  test('a note already shown this session is left out and said so', async ($, on) => {
    engineKeeps(on)
    const corner = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...wideHint })
    const menus = await mountMenus($)
    const [menu] = menus
    await corner.press({ key: 'tools-toggle' })
    await menu.press({ key: 'tab-learn' })
    await menu.press({ key: 'learn-on' })
    await $.tool.call({ tool: LEARN_TOOL, notes: [{ title: 'Vite', text: 'A dev server.' }] } as never)
    const again = await $.tool.call({ tool: LEARN_TOOL, notes: [{ title: 'vite', text: 'Again.' }, { title: 'Bun', text: 'Runs tests.' }] } as never)
    expect(again).toMatchObject({ result: 'ok; already shown: vite' })
    for (const m of menus) expect((await m.findAll({ type: 'Markdown' })).map(n => n.props.text)).toEqual(['A dev server.', 'Runs tests.'])
  })

  test("the notes sit under the request they were posted in", async ($, on) => {
    engineKeeps(on)
    on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
    // A 40-row pane, so both requests' notes fit.
    const menus = await mountMenus($, 40)
    const [menu] = menus
    const corner = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...wideHint })
    await corner.press({ key: 'tools-toggle' })
    await menu.press({ key: 'tab-learn' })
    await menu.press({ key: 'learn-on' })

    await $.prompt.submit({ text: 'add a login page', origin: { kind: 'composer' } } as never)
    await $.tool.call({ tool: LEARN_TOOL, notes: [{ title: 'JWT', text: 'A signed token.' }, { title: 'bcrypt', text: 'Hashes passwords.' }] } as never)
    await $.prompt.submit({ text: 'now the tests', origin: { kind: 'composer' } } as never)
    await $.tool.call({ tool: LEARN_TOOL, notes: [{ title: 'Bun test', text: 'Runs the tests.' }] } as never)

    for (const m of menus) {
      expect(await m.findAll({ type: 'Text', text: /── add a login page ─/ })).toHaveLength(1)
      expect(await m.findAll({ type: 'Text', text: /── now the tests ─/ })).toHaveLength(1)
      expect(await m.findAll({ type: 'Markdown' })).toHaveLength(3)
    }
  })

  test("a subagent's explain call is refused and shows nothing", async ($, on) => {
    engineKeeps(on)
    const menu = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...pane })
    const answered = await $.tool.call({ tool: LEARN_TOOL, agentId: 'a1', notes: [{ title: 'Vite', text: 'x' }] } as never)
    expect(answered).toMatchObject({ deny: expect.stringMatching(/main conversation only/) })
  })

  test('with learn mode off a call is kept but the menu stays closed', async ($, on) => {
    const { opened } = engineKeeps(on)
    const menu = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...pane })
    const answered = await $.tool.call({ tool: LEARN_TOOL, title: 'npm', text: 'Installs packages.' } as never)
    expect(answered).toMatchObject({ result: 'ok' })
    expect(opened).toHaveLength(0)
    expect(await menu.find({ key: 'learn-on' })).toBeUndefined()
  })

  test('on a terminal too narrow for the pane, a new explanation says once how to open it, and that works', async ($, on) => {
    mock.store(on)
    on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))
    // An open the mod makes on its own waits undrawn; one the person asks for is placed.
    const opened: PaneOpenArgs[] = []
    on('ui.open', (_$, e) => {
      opened.push(e)
      return { value: e.focus ? { isPlaced: true as const } : { isPlaced: false as const, reason: 'under 144 columns' } }
    })
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
    await $.tool.call({ tool: LEARN_TOOL, title: 'React', text: 'A UI library.' } as never)
    expect(toasts.filter(t => t.includes('Nova explicação em Aprender'))).toHaveLength(1)
    // The pane that could not be placed is not left waiting: the corner shows it closed.
    expect((await corner.find({ key: 'tools-toggle' }))?.text).toMatch(/▲/)

    // What the toast says to do opens the tab, with the keyboard, and shows both notes.
    await $.command.run({ command: 'tools', args: 'learn' } as never)
    expect(opened.at(-1)).toMatchObject({ id: 'claude-tools', focus: true })
    expect(await menu.findAll({ type: 'Markdown' })).toHaveLength(2)
  })

  test('many notes keep the tabs and the switch whole; a note too tall shows its title', async ($, on) => {
    engineKeeps(on)
    const corner = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...hint })
    const menus = await mountMenus($)
    const [menu] = menus
    await corner.press({ key: 'tools-toggle' })
    await menu.press({ key: 'tab-learn' })
    await menu.press({ key: 'learn-on' })
    // Nine, so the long one below still fits under the session's ten.
    for (let i = 0; i < 9; i++) await $.tool.call({ tool: LEARN_TOOL, title: `Note ${i}`, text: 'Short.' } as never)
    for (const m of menus) {
      // A 26-row pane leaves the list 9 rows: the two newest four-row cards.
      expect(await m.findAll({ type: 'Markdown' })).toHaveLength(2)
      expect(await m.find({ text: /Note 8/ })).toBeDefined()
      expect(await m.find({ text: /Note 6/ })).toBeUndefined()
      for (const key of ['tabs', 'h-Learn mode', 'learn-onoff']) expect((await m.find({ key }))?.props.flexShrink).toBe(0)
      expect((await m.find({ key: 'learn-list' }))?.props.justifyContent).toBe('flex-end')
    }

    await $.tool.call({ tool: LEARN_TOOL, title: 'A long one', text: 'line\n'.repeat(10) } as never)
    for (const m of menus) {
      expect(await m.findAll({ type: 'Markdown' })).toHaveLength(1)
      expect(await m.find({ text: /A long one/ })).toBeDefined()
      expect((await m.find({ key: 'learn-list' }))?.props.justifyContent).toBe('flex-start')
    }
  })

  test("the desktop's taller tab strip leaves the list fewer rows than the terminal's", async ($, on) => {
    engineKeeps(on)
    const corner = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...hint })
    // 29 rows: the terminal's list gets 12 (three four-row cards), the desktop's 11 (two).
    const [terminal, desktop] = await mountMenus($, 29)
    await corner.press({ key: 'tools-toggle' })
    await terminal.press({ key: 'tab-learn' })
    await terminal.press({ key: 'learn-on' })
    for (let i = 0; i < 5; i++) await $.tool.call({ tool: LEARN_TOOL, title: `Note ${i}`, text: 'Short.' } as never)
    expect(await terminal.findAll({ type: 'Markdown' })).toHaveLength(3)
    expect(await desktop.findAll({ type: 'Markdown' })).toHaveLength(2)
  })

  test('a /clear empties the Learn tab and keeps learn mode', async ($, on) => {
    const { kept } = engineKeeps(on, { statusOn: false })
    on('env.get', () => ({ value: '/home/me' }))
    on('fs.exists', () => ({ value: false }))
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('classic.SessionStart', () => ({}))
    const corner = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...hint })
    const menus = await mountMenus($)
    const [menu] = menus
    await corner.press({ key: 'tools-toggle' })
    await menu.press({ key: 'tab-learn' })
    await menu.press({ key: 'learn-on' })
    await $.tool.call({ tool: LEARN_TOOL, title: 'Vite', text: 'A dev server.' } as never)
    for (const m of menus) expect(await m.find({ type: 'Markdown' })).toBeDefined()

    await $.classic.SessionStart({ source: 'clear' })
    expect(kept.get('learnOn')).toBe(true)
    await corner.press({ key: 'tools-toggle' })
    await menu.press({ key: 'tab-learn' })
    for (const m of menus) {
      expect(await isChosen(m, 'learn-on')).toBe(true)
      expect(await m.find({ type: 'Markdown' })).toBeUndefined()
      expect(await m.find({ text: /No explanations yet/ })).toBeDefined()
    }
  })

  test('a session takes 10 explanations, counted in the tab, then refuses more until a /clear', async ($, on) => {
    engineKeeps(on, { statusOn: false })
    on('env.get', () => ({ value: '/home/me' }))
    on('fs.exists', () => ({ value: false }))
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('classic.SessionStart', () => ({}))
    const corner = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...hint })
    const menus = await mountMenus($)
    const [menu] = menus
    await corner.press({ key: 'tools-toggle' })
    await menu.press({ key: 'tab-learn' })
    await menu.press({ key: 'learn-on' })

    for (let i = 1; i <= 8; i++) await $.tool.call({ tool: LEARN_TOOL, title: `Note ${i}`, text: 'Short.' } as never)
    // A call that runs past the tenth keeps what fits and names the rest.
    const notes = ['Note 9', 'Note 10', 'Note 11'].map(title => ({ title, text: 'Short.' }))
    expect(await $.tool.call({ tool: LEARN_TOOL, notes } as never)).toMatchObject({ result: 'ok; over the limit of 10 a session: Note 11' })
    for (const m of menus) expect(await m.find({ text: /10\/10 this session/ })).toBeDefined()

    // Once full, every call is refused and kept nowhere.
    const refused = (await $.tool.call({ tool: LEARN_TOOL, title: 'One more', text: 'Too many.' } as never)) as { deny?: string }
    expect(refused.deny).toMatch(/limit of 10 explanations/)
    for (const m of menus) expect(await m.find({ text: /One more/ })).toBeUndefined()

    // A /clear starts the count over; the count follows the panel's language.
    await $.classic.SessionStart({ source: 'clear' })
    await corner.press({ key: 'tools-toggle' })
    await menu.press({ key: 'tab-learn' })
    await menu.press({ key: 'lang-pt' })
    expect(await $.tool.call({ tool: LEARN_TOOL, title: 'Vite', text: 'Um servidor.' } as never)).toMatchObject({ result: 'ok' })
    for (const m of menus) expect(await m.find({ text: /1\/10 nesta sessão/ })).toBeDefined()
  })
})
