// The options file and the /translate:settings panel.

import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import type { Theme } from '@earendil-works/pi-coding-agent'
import { DynamicBorder, getSelectListTheme, getSettingsListTheme, keyText } from '@earendil-works/pi-coding-agent'
import {
  Container,
  fuzzyFilter,
  getKeybindings,
  Input,
  SelectList,
  SettingsList,
  Spacer,
  Text,
  truncateToWidth,
  type Component,
  type SelectItem,
  type SettingItem,
} from '@earendil-works/pi-tui'

export type Options = Record<string, unknown>

/** The options in `file`; a missing file is no options, an unreadable one throws. */
export function readOptionsFile(file: string): Options {
  let raw: string
  try {
    raw = readFileSync(file, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw err
  }
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${file}: expected a JSON object`)
  return value as Options
}

/**
 * Writes `changes` over the options in `file`, keeping every other key. An
 * empty string or undefined removes the key, so the default applies. The file
 * is replaced in one rename and readable by its owner only, since it may hold
 * an API key.
 */
export function writeOptions(file: string, changes: Options): Options {
  const options = { ...readOptionsFile(file) }
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === '') delete options[key]
    else options[key] = value
  }
  mkdirSync(dirname(file), { recursive: true })
  const temp = `${file}.${randomUUID()}.tmp`
  try {
    writeFileSync(temp, `${JSON.stringify(options, null, 2)}\n`, { mode: 0o600 })
    renameSync(temp, file)
  } finally {
    rmSync(temp, { force: true })
  }
  return options
}

/** One row of the panel. `display` turns the stored value into the right-hand text. */
export type Row = {
  id: string
  label: string
  description: string
  value: string
  display?: (value: string) => string
} & ({ kind: 'toggle' } | { kind: 'choice'; choices: () => SelectItem[]; search?: boolean } | { kind: 'text'; secret?: boolean })

function hints(theme: Theme, list: [Parameters<typeof keyText>[0], string][]): string {
  return theme.fg('dim', list.map(([key, what]) => `${keyText(key)} ${what}`).join(' · '))
}

function framed(theme: Theme, title: string, description: string, body: Component, hint: string): Container {
  const container = new Container()
  container.addChild(new Text(theme.bold(theme.fg('accent', title)), 0, 0))
  container.addChild(new Text(theme.fg('muted', description), 0, 0))
  container.addChild(new Spacer(1))
  container.addChild(body)
  container.addChild(new Spacer(1))
  container.addChild(new Text(hint, 0, 0))
  return container
}

const MAX_VISIBLE = 10

/** A single choice; with `search`, typing narrows the list. */
function choiceMenu(theme: Theme, row: Row & { kind: 'choice' }, done: (value?: string) => void): Component {
  const all = row.choices()
  const query = new Input()
  const box = new Container()
  let list: SelectList
  const build = (filter: string) => {
    const items = filter ? fuzzyFilter(all, filter, item => `${item.label} ${item.description ?? ''}`) : all
    list = new SelectList(items, Math.min(Math.max(items.length, 1), MAX_VISIBLE), getSelectListTheme())
    const index = filter ? 0 : items.findIndex(item => item.value === row.value)
    if (index >= 0) list.setSelectedIndex(index)
    list.onSelect = item => done(item.value === row.value ? undefined : item.value)
    list.onCancel = () => done()
    box.clear()
    if (row.search) box.addChild(query)
    box.addChild(list)
  }
  build('')
  const kb = getKeybindings()
  const container = framed(
    theme,
    row.label,
    row.description,
    box,
    hints(theme, [
      ['tui.select.confirm', 'to select'],
      ['tui.select.cancel', 'to go back'],
    ]),
  )
  return {
    render: width => container.render(width),
    invalidate: () => container.invalidate(),
    handleInput(data) {
      const toList = ['tui.select.up', 'tui.select.down', 'tui.select.pageUp', 'tui.select.pageDown', 'tui.select.confirm', 'tui.select.cancel'] as const
      if (!row.search || toList.some(key => kb.matches(data, key))) return list.handleInput(data)
      query.handleInput(data)
      build(query.getValue())
    },
  }
}

/** A line of text; Enter keeps it, an empty line goes back to the default. A secret starts empty. */
function textMenu(theme: Theme, row: Row & { kind: 'text' }, done: (value?: string) => void): Component {
  const input = new Input()
  if (!row.secret) input.setValue(row.value)
  input.onSubmit = value => done(value.trim() === row.value ? undefined : value.trim())
  input.onEscape = () => done()
  input.focused = true
  const container = framed(
    theme,
    row.label,
    row.description,
    input,
    hints(theme, [
      ['tui.input.submit', 'to save'],
      ['tui.select.cancel', 'to go back'],
    ]),
  )
  return {
    render: width => container.render(width),
    invalidate: () => container.invalidate(),
    handleInput: data => input.handleInput(data),
  }
}

/**
 * The settings panel. `save` stores one changed value and returns false when it
 * could not; the row then shows the value it had.
 */
export function settingsPanel(
  theme: Theme,
  title: string,
  rows: Row[],
  save: (id: string, value: string) => boolean,
  close: () => void,
  requestRender: () => void,
): Component {
  const shown = (row: Row) => (row.display ? row.display(row.value) : row.value)
  const items: SettingItem[] = rows.map(row => {
    const item: SettingItem = { id: row.id, label: row.label, description: row.description, currentValue: shown(row) }
    if (row.kind === 'toggle') item.values = ['on', 'off']
    else if (row.kind === 'choice') item.submenu = (_shown, done) => choiceMenu(theme, row, done)
    else item.submenu = (_shown, done) => textMenu(theme, row, done)
    return item
  })
  const list = new SettingsList(
    items,
    MAX_VISIBLE,
    getSettingsListTheme(),
    (id, value) => {
      const row = rows.find(r => r.id === id)!
      if (save(id, value)) row.value = value
      list.updateValue(id, shown(row))
    },
    close,
  )
  const container = new Container()
  container.addChild(new DynamicBorder(line => theme.fg('border', line)))
  container.addChild(new Text(theme.bold(theme.fg('accent', title)), 1, 0))
  container.addChild(new Spacer(1))
  container.addChild(list)
  container.addChild(new DynamicBorder(line => theme.fg('border', line)))
  return {
    render: width => container.render(width).map(line => truncateToWidth(line, width)),
    invalidate: () => container.invalidate(),
    handleInput(data) {
      list.handleInput(data)
      requestRender()
    },
  }
}
