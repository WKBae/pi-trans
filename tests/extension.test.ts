import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mock } from 'node:test'

import { getMarkdownTheme, initTheme } from '@earendil-works/pi-coding-agent'
import { Markdown } from '@earendil-works/pi-tui'

import piTrans from '../src/index.ts'
import { expect, test } from './expect.ts'

const KO: Record<string, string> = {
  '⟦0⟧ 이 함수 왜 느린지 봐줘': 'Why is ⟦0⟧ slow?',
  '이 함수 왜 느린지 봐줘': 'Why is this function slow?',
  'Fix the loop': '루프 고치기',
  'The loop calls ⟦0⟧ on every pass.': '루프가 매번 ⟦0⟧를 호출해요.',
  'Move it out:': '밖으로 옮기세요:',
  'Use ⟦0⟧ to transform.': '변환하려면 ⟦0⟧를 쓰세요.',
  Call: '호출',
  Result: '결과',
  'new array': '새 배열',
}

const REPLY = ['## Fix the loop', '', 'The loop calls `fetchUser()` on every pass.', '', '```ts', 'for (const id of ids) await fetchUser(id)', '```', '', 'Move it out:'].join('\n')

initTheme('dark')

/** What Pi shows for a message's Markdown at `width`: rendered, colors taken out, every space plain, trailing ones trimmed. */
function seen(md: string, width = 100): string {
  return new Markdown(md, 0, 0, getMarkdownTheme())
    .render(width)
    .map(l => l.replace(/\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '').replaceAll('\u00a0', ' ').trimEnd())
    .join('\n')
}

type Handler = (event: unknown, ctx: unknown) => unknown
type Transform = (md: string, ctx: { messageType: string; isStreaming: boolean; availableWidth: number }) => string

/** Loads the extension into a stand-in for Pi, with a model that answers from `KO`. */
async function start(
  options: Record<string, unknown>,
  env: Record<string, string | undefined> = { LANG: 'ko_KR.UTF-8' },
  entries: { type: string; customType?: string; data?: unknown; message?: unknown }[] = [],
) {
  const dir = mkdtempSync(join(tmpdir(), 'pi-trans-'))
  writeFileSync(join(dir, 'pi-trans.json'), JSON.stringify(options))
  process.env.PI_CODING_AGENT_DIR = dir
  for (const name of ['LC_ALL', 'LC_MESSAGES', 'LANG']) {
    if (env[name] === undefined) delete process.env[name]
    else process.env[name] = env[name]
  }

  const handlers = new Map<string, Handler>()
  const commands = new Map<string, { handler: (args: string, ctx: unknown) => Promise<void> }>()
  let transform: Transform = md => md
  const calls: string[][] = []
  const notes: string[] = []
  let draft = ''
  let widget: { render(width: number): string[] } | undefined

  const pi = {
    on: (name: string, fn: Handler) => handlers.set(name, fn),
    registerMarkdownTransformer: (fn: Transform) => (transform = fn),
    registerCommand: (name: string, def: { handler: (args: string, ctx: unknown) => Promise<void> }) => commands.set(name, def),
    appendEntry: (customType: string, data: unknown) => entries.push({ type: 'custom', customType, data }),
  }
  const model = { provider: 'anthropic', id: 'claude-haiku-4-5' }
  const ctx = {
    mode: 'tui',
    model,
    modelRegistry: {
      find: () => model,
      getAvailable: () => [model],
      getAll: () => [model],
      async complete(_model: unknown, context: { messages: { content: { text: string }[] }[] }) {
        const items = JSON.parse(context.messages[0]!.content[0]!.text) as string[]
        calls.push(items)
        return { stopReason: 'stop', content: [{ type: 'text', text: JSON.stringify(items.map(s => KO[s] ?? `[x] ${s}`)) }] }
      },
    },
    sessionManager: { getEntries: () => entries, getBranch: () => entries },
    ui: {
      theme: { fg: (_color: string, text: string) => text, getFgAnsi: () => '' },
      setStatus: () => {},
      notify: (text: string) => notes.push(text),
      getEditorText: () => draft,
      setWidget: (_key: string, factory: (tui: unknown) => { render(width: number): string[] }) => {
        widget = factory({ invalidate() {}, requestRender() {} })
      },
    },
  }

  piTrans(pi as never)
  await handlers.get('session_start')!({ reason: 'startup' }, ctx)

  return {
    calls,
    notes,
    entries,
    input: (text: string) => handlers.get('input')!({ type: 'input', text, source: 'interactive' }, ctx) as Promise<{ action: string; text?: string }>,
    reply: (text: string) => handlers.get('message_end')!({ message: { role: 'assistant', content: [{ type: 'text', text }] } }, ctx),
    textEnd: (text: string) =>
      handlers.get('message_update')!({ assistantMessageEvent: { type: 'text_end', contentIndex: 0, content: text } }, ctx),
    draw: (messageType: 'user' | 'assistant', md: string, width = 100) => transform(md, { messageType, isStreaming: false, availableWidth: width }),
    command: (args: string) => commands.get('translate')!.handler(args, ctx),
    type: (text: string) => (draft = text),
    above: (width = 80) => widget?.render(width).join('\n') ?? '',
    stop: () => handlers.get('session_shutdown')!({}, ctx),
  }
}

/** Lets the tick run and the translations it starts settle. */
async function settle(ms: number) {
  mock.timers.tick(ms)
  for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve))
}

test('a prompt in Korean goes out in English, code never sent, and its row shows both', async () => {
  const pi = await start({})
  const r = await pi.input('`fetchUser()` 이 함수 왜 느린지 봐줘')
  expect(r).toEqual({ action: 'transform', text: 'Why is `fetchUser()` slow?' })
  expect(JSON.stringify(pi.calls)).not.toContain('fetchUser')
  const row = pi.draw('user', 'Why is `fetchUser()` slow?')
  expect(row).toContain('`fetchUser()` 이 함수 왜 느린지 봐줘')
  expect(row).toContain('↳')
  await pi.stop()
})

test('English prompts, slash commands and shell lines pass through untranslated', async () => {
  const pi = await start({})
  for (const text of ['Why is this slow?', '/model', '!ls 폴더']) expect(await pi.input(text)).toEqual({ action: 'continue' })
  expect(pi.calls).toHaveLength(0)
  await pi.stop()
})

test('a reply is translated in the background and drawn interleaved, code once', async () => {
  mock.timers.enable({ apis: ['setInterval', 'Date'] })
  try {
    const pi = await start({ view: 'interleave' })
    await pi.reply(REPLY)
    expect(pi.draw('assistant', REPLY)).toContain('translating…')
    await settle(300)
    const drawn = pi.draw('assistant', REPLY)
    expect(drawn).toContain('## Fix the loop · 루프 고치기')
    expect(drawn).toContain('The loop calls `fetchUser()` on every pass.\n> 루프가 매번 `fetchUser()`를 호출해요.')
    expect(drawn.split('for (const id of ids) await fetchUser(id)')).toHaveLength(2)
    expect(pi.calls).toHaveLength(1)
    expect(JSON.stringify(pi.calls)).not.toContain('for (const id')
    await pi.stop()
  } finally {
    mock.timers.reset()
  }
})

test('a text block is translated when it ends, before its reply finishes streaming', async () => {
  mock.timers.enable({ apis: ['setInterval', 'Date'] })
  try {
    const pi = await start({ view: 'interleave' })
    await pi.textEnd(REPLY)
    await settle(300)
    expect(pi.draw('assistant', REPLY)).toContain('## Fix the loop · 루프 고치기')
    await pi.reply(REPLY)
    await settle(300)
    expect(pi.calls).toHaveLength(1)
    await pi.stop()
  } finally {
    mock.timers.reset()
  }
})

test('the stacked view keeps the original and puts the rendered translation under it, indented', async () => {
  mock.timers.enable({ apis: ['setInterval', 'Date'] })
  try {
    const pi = await start({ view: 'stacked' })
    await pi.reply(REPLY)
    await settle(300)
    const drawn = seen(pi.draw('assistant', REPLY))
    expect(drawn).toContain('The loop calls fetchUser() on every pass.\n\n  루프가 매번 fetchUser()를 호출해요.')
    expect(drawn.split('for (const id of ids) await fetchUser(id)')).toHaveLength(2)
    await pi.stop()
  } finally {
    mock.timers.reset()
  }
})

test('in the stacked view a translated table is drawn as a table, and code keeps its parentheses', async () => {
  mock.timers.enable({ apis: ['setInterval', 'Date'] })
  try {
    const pi = await start({ view: 'stacked' })
    const reply = ['Use `nums.map(n => n * 2)` to transform.', '', '| Call | Result |', '|---|---|', '| `map()` | new array |'].join('\n')
    await pi.reply(reply)
    await settle(300)
    const drawn = seen(pi.draw('assistant', reply))
    expect(drawn).toContain('  변환하려면 nums.map(n => n * 2)를 쓰세요.')
    expect(drawn).toContain('  │ 호출  │ 결과    │')
    expect(drawn).toContain('  │ map() │ 새 배열 │')
    expect(drawn).not.toContain('\\')
    await pi.stop()
  } finally {
    mock.timers.reset()
  }
})

test('a resumed session draws saved translations without asking again', async () => {
  mock.timers.enable({ apis: ['setInterval', 'Date'] })
  try {
    const first = await start({ view: 'interleave' })
    await first.input('`fetchUser()` 이 함수 왜 느린지 봐줘')
    await first.reply(REPLY)
    await settle(300)
    await first.stop()
    const message = { role: 'assistant', content: [{ type: 'text', text: REPLY }] }
    const pi = await start({ view: 'interleave' }, undefined, [...first.entries, { type: 'message', message }])
    await settle(300)
    expect(pi.calls).toHaveLength(0)
    expect(pi.draw('assistant', REPLY)).toContain('> 루프가 매번 `fetchUser()`를 호출해요.')
    expect(pi.draw('user', 'Why is `fetchUser()` slow?')).toContain('`fetchUser()` 이 함수 왜 느린지 봐줘')
    await pi.stop()
  } finally {
    mock.timers.reset()
  }
})

test('a resting draft is previewed above the editor, and Enter reuses it', async () => {
  mock.timers.enable({ apis: ['setInterval', 'Date'] })
  try {
    const pi = await start({})
    pi.type('이 함수 왜 느린지 봐줘')
    await settle(300)
    expect(pi.above()).toBe('')
    await settle(1000)
    expect(pi.above()).toContain('EN ▸ Why is this function slow?')
    expect(await pi.input('이 함수 왜 느린지 봐줘')).toEqual({ action: 'transform', text: 'Why is this function slow?' })
    expect(pi.calls).toHaveLength(1)
    await pi.stop()
  } finally {
    mock.timers.reset()
  }
})

test('with Japanese chosen, Japanese prompts are translated and Korean ones are not', async () => {
  const pi = await start({ language: 'Japanese' })
  expect((await pi.input('この関数はなぜ遅いですか')).action).toBe('transform')
  expect((await pi.input('이 함수 왜 느려')).action).toBe('continue')
  expect(pi.calls).toHaveLength(1)
  await pi.stop()
})

test('with no language anywhere nothing is translated', async () => {
  const pi = await start({}, {})
  expect(await pi.input('이 함수 왜 느려')).toEqual({ action: 'continue' })
  await pi.reply('Some reply.')
  expect(pi.draw('assistant', 'Some reply.')).toBe('Some reply.')
  expect(pi.calls).toHaveLength(0)
  await pi.stop()
})

test('/translate off leaves prompts and replies alone, and view changes the layout', async () => {
  const pi = await start({})
  await pi.command('off')
  expect(await pi.input('이 함수 왜 느려')).toEqual({ action: 'continue' })
  await pi.command('on')
  await pi.command('view side')
  expect(pi.notes.at(-1)).toContain('side')
  await pi.stop()
})
