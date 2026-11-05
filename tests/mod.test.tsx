import { expect, mock, test, type Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { translateUnits, type EngineConfig, type Io } from '../hooks/engines'
import { maskText, planMarkdown } from '../hooks/markdown'
import { interleave, plainLines, plainText, stackedBlocks } from '../hooks/register'
import { pickLanguage, toLanguageCode } from '../hooks/language'

const USAGE = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }

/** A model that answers the JSON-array protocol through `fn`, recording each call. */
function fakeModel(on: On, fn: (s: string) => string) {
  const calls: string[][] = []
  on('model.complete', (_$, e) => {
    const items = JSON.parse(e.prompt) as string[]
    calls.push(items)
    return { value: { isAnswered: true as const, text: JSON.stringify(items.map(fn)), usage: USAGE } }
  })
  return calls
}

function engineStandIn(on: On) {
  // Nothing draws beneath the plugin: this stands for the engine's own row.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{(e.props as { text?: string }).text ?? ''}</Text>
  })
}

/** Starts a session whose language comes from where the person set it: here, the locale. */
async function start($: Engine, on: On, where: { settings?: Record<string, unknown>; env?: Record<string, string> } = {}) {
  mock.env(on, where.env ?? { LANG: 'ko_KR.UTF-8' })
  on('settings.read', () => ({ value: where.settings ?? {} }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'translate' } }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
}

const KO: Record<string, string> = {
  '⟦0⟧ 이 함수 왜 느린지 봐줘': 'Why is ⟦0⟧ slow?',
  'Fix the loop': '루프 고치기',
  'The loop calls ⟦0⟧ on every pass.': '루프가 매번 ⟦0⟧를 호출해요.',
  'Move it out:': '밖으로 옮기세요:',
}
const ko = (s: string) => KO[s] ?? `[ko] ${s}`

test('a prompt in the person language reaches Claude in English, code untouched', async ($, on) => {
  mock.clock(on)
  const calls = fakeModel(on, ko)
  let sent = ''
  on('prompt.submit', (_$, e) => {
    sent = e.text
    return { text: e.text }
  })
  await start($, on)
  await $.prompt.submit({ text: '`fetchUser()` 이 함수 왜 느린지 봐줘', wait: false, origin: { kind: 'composer' } })
  expect(sent).toBe('Why is `fetchUser()` slow?')
  // the translator never saw the code
  expect(JSON.stringify(calls)).not.toContain('fetchUser')
})

test('English prompts, slash commands and hidden prompts pass through untranslated', async ($, on) => {
  mock.clock(on)
  const calls = fakeModel(on, ko)
  const sent: string[] = []
  on('prompt.submit', (_$, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  await start($, on)
  await $.prompt.submit({ text: 'Why is this slow?', wait: false, origin: { kind: 'composer' } })
  await $.prompt.submit({ text: '이건 숨은 프롬프트', wait: false, isMeta: true, origin: { kind: 'composer' } })
  await $.prompt.submit({ text: '다른 세션의 메시지', wait: false, origin: { kind: 'peer' } as never })
  expect(sent).toEqual(['Why is this slow?', '이건 숨은 프롬프트', '다른 세션의 메시지'])
  expect(calls).toHaveLength(0)
})

test('the sent prompt row shows what was typed, and the English under it', async ($, on) => {
  mock.clock(on)
  fakeModel(on, ko)
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  engineStandIn(on)
  await start($, on)
  await $.prompt.submit({ text: '`fetchUser()` 이 함수 왜 느린지 봐줘', wait: false, origin: { kind: 'composer' } })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'cc-trans',
      surface,
      component: 'UserMessage',
      requestId: 'p1',
      props: { text: 'Why is `fetchUser()` slow?', origin: { kind: 'composer' }, isExpanded: true },
    } as never)
    expect((await ui.find({ type: 'Text', text: /이 함수/ }))?.text).toBe('`fetchUser()` 이 함수 왜 느린지 봐줘')
    expect((await ui.find({ type: 'Text', text: /↳/ }))?.text).toBe('↳ ')
    expect((await ui.find({ type: 'Text', text: /^Why is/ }))?.text).toBe('Why is `fetchUser()` slow?')
    await ui.unmount()
  }
})

const REPLY = ['## Fix the loop', '', 'The loop calls `fetchUser()` on every pass.', '', '```ts', 'for (const id of ids) await fetchUser(id)', '```', '', 'Move it out:'].join('\n')

test('a reply is translated in the background and drawn interleaved, code once', { options: { view: 'interleave' } }, async ($, on) => {
  const clock = mock.clock(on)
  const calls = fakeModel(on, ko)
  engineStandIn(on)
  await start($, on)
  await $.session.append({
    door: 'response',
    origin: { kind: 'model', model: 'claude' },
    uuid: 'r1',
    message: { type: 'assistant', role: 'assistant', content: [{ type: 'text', text: REPLY }] },
  } as never)

  // before the worker runs, the reply shows a pending note
  let ui = await $.ui.mount({
    plugin: 'cc-trans',
    surface: 'terminal',
    component: 'AssistantMessage',
    requestId: 'r1',
    props: { text: REPLY, isFirstOfReply: true },
  } as never)
  expect(await ui.find({ type: 'Text', text: /번역 중/ })).toBeDefined()
  await ui.unmount()

  await clock.advance(300)
  await clock.settle()

  ui = await $.ui.mount({
    plugin: 'cc-trans',
    surface: 'terminal',
    component: 'AssistantMessage',
    requestId: 'r1',
    props: { text: REPLY, isFirstOfReply: true },
  } as never)
  const drawn = (await ui.find({ type: 'Text', text: /Fix the loop/ }))?.text ?? ''
  expect(drawn).toContain('## Fix the loop · 루프 고치기')
  expect(drawn).toContain('The loop calls `fetchUser()` on every pass.\n> 루프가 매번 `fetchUser()`를 호출해요.')
  expect(drawn.split('for (const id of ids) await fetchUser(id)')).toHaveLength(2)
  expect(drawn).toContain('Move it out:\n> 밖으로 옮기세요:')
  // one call, and the code block never reached it
  expect(calls).toHaveLength(1)
  expect(JSON.stringify(calls)).not.toContain('for (const id')
  await ui.unmount()
})

test('interleave keeps every original line and adds translations as quotes', () => {
  const plan = planMarkdown('- one item\n- two item\n\n| A | B |\n| --- | --- |\n| x y | z w |')
  const out = plan.units.map(u => `[ko] ${u.text}`)
  const text = interleave(plan, out)
  expect(text).toContain('- one item\n- two item\n> - [ko] one item\n> - [ko] two item')
  expect(text).toContain('| A | B |\n| --- | --- |\n| x y | z w |\n> | [ko] A | [ko] B |')
})

const CFG: EngineConfig = {
  kind: 'openai',
  haikuModel: 'haiku',
  openaiBaseUrl: 'http://localhost:1/v1',
  openaiModel: 'm',
  openaiApiKey: '',
  command: '',
  fallback: true,
}

function io(overrides: Partial<Io>): Io {
  return {
    complete: async req => ({ ok: true, text: JSON.stringify((JSON.parse(req.prompt) as string[]).map(s => `H:${s}`)) }),
    fetch: async () => ({ status: 403, ok: false, text: '' }),
    run: async () => ({ exitCode: 1, stdout: '', stderr: 'nope' }),
    ...overrides,
  }
}

test('a failing external engine falls back to haiku, labelled haiku', async () => {
  const unit = maskText('Run `npm test` now')!
  const r = await translateUnits(io({}), CFG, [unit], 'en', 'ko')
  expect(r.engine).toBe('haiku')
  expect(r.out).toEqual(['H:Run `npm test` now'])
  expect(r.error).toContain('HTTP 403')
})

test('with fallback off the failure is reported and nothing is translated', async () => {
  const unit = maskText('Run the tests')!
  const r = await translateUnits(io({}), { ...CFG, fallback: false }, [unit], 'en', 'ko')
  expect(r.out).toEqual([null])
  expect(r.error).toBe('openai: HTTP 403')
})

test('an engine that drops a placeholder loses only that line', async () => {
  const units = [maskText('Call `a()` here')!, maskText('Plain words')!]
  const r = await translateUnits(
    io({ complete: async () => ({ ok: true, text: JSON.stringify(['dropped the code', '그냥 단어']) }) }),
    { ...CFG, kind: 'haiku' },
    units,
    'en',
    'ko',
  )
  expect(r.out).toEqual([null, '그냥 단어'])
})

test('the command engine speaks JSON over stdin and stdout', async () => {
  let stdin = ''
  const r = await translateUnits(
    io({
      run: async (argv, input) => {
        stdin = input
        expect(argv).toEqual(['apple-translate', '--quiet'])
        return { exitCode: 0, stdout: JSON.stringify({ lines: ['안녕'] }), stderr: '' }
      },
    }),
    { ...CFG, kind: 'command', command: 'apple-translate --quiet' },
    [maskText('Hello')!],
    'en',
    'ko',
  )
  expect(JSON.parse(stdin)).toEqual({ from: 'en', to: 'ko', lines: ['Hello'] })
  expect(r.out).toEqual(['안녕'])
  expect(r.engine).toBe('command')
})

test('a resting draft is previewed above the prompt, and Enter reuses it', async ($, on) => {
  const clock = mock.clock(on)
  const calls = fakeModel(on, s => (s === '이 함수 왜 느린지 봐줘' ? 'Why is this function slow?' : `[en] ${s}`))
  const draft = '이 함수 왜 느린지 봐줘'
  on('prompt.edit', () => ({ text: draft, cursor: draft.length }))
  let sent = ''
  on('prompt.submit', (_$, e) => {
    sent = e.text
    return { text: e.text }
  })
  engineStandIn(on)
  await start($, on)
  await ($.prompt as unknown as { edit: (e: unknown) => Promise<unknown> }).edit({ origin: { kind: 'key' }, text: '', cursor: 0, start: 0, end: 0, inputText: draft } as never)

  const BAND = {
    plugin: 'cc-trans',
    component: 'AbovePrompt',
    requestId: 'band',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  } as const

  // still typing: nothing yet
  await clock.advance(300)
  let ui = await $.ui.mount({ ...BAND, surface: 'terminal' } as never)
  expect(await ui.find({ type: 'Text', text: /EN ▸/ })).toBeUndefined()
  await ui.unmount()

  await clock.advance(800)
  await clock.settle()
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' } as never)
  expect((await ui.find({ type: 'Text', text: /slow/ }))?.text).toBe('Why is this function slow?')
  await ui.unmount()

  await $.prompt.submit({ text: draft, wait: false, origin: { kind: 'composer' } })
  expect(sent).toBe('Why is this function slow?')
  expect(calls).toHaveLength(1)
})

test('a translated prompt carries nothing but the English: no added language instruction', async ($, on) => {
  mock.clock(on)
  fakeModel(on, ko)
  let context: readonly string[] | undefined = ['unset']
  on('prompt.submit', (_$, e) => {
    context = e.context
    return { text: e.text }
  })
  await start($, on)
  await $.prompt.submit({ text: '`fetchUser()` 이 함수 왜 느린지 봐줘', wait: false, origin: { kind: 'composer' } })
  expect(context).toBeUndefined()
})

test('at the end of a turn the reply blocks are read back and translated', { options: { view: 'interleave' } }, async ($, on) => {
  const clock = mock.clock(on)
  const calls = fakeModel(on, ko)
  engineStandIn(on)
  on('session.messages', () => ({
    value: [
      { role: 'user', content: [{ type: 'text', text: 'earlier prompt' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Old reply.' }] },
      { role: 'user', content: [{ type: 'text', text: 'Why is this slow?' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Move it out:' }, { type: 'tool_use', id: 't1', name: 'Read', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'x' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Fix the loop' }] },
    ],
  }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  await start($, on)
  await $.turn.complete({ answer: 'Fix the loop', durationMs: 1, isAborted: false, turnId: 'x', reason: 'end_turn' } as never)
  await clock.advance(300)
  await clock.settle()
  expect(calls.flat().sort()).toEqual(['Fix the loop', 'Move it out:'])
  const ui = await $.ui.mount({
    plugin: 'cc-trans',
    surface: 'terminal',
    component: 'AssistantMessage',
    requestId: 'r2',
    props: { text: 'Move it out:', isFirstOfReply: true },
  } as never)
  expect((await ui.find({ type: 'Text', text: /Move/ }))?.text).toBe('Move it out:\n> 밖으로 옮기세요:')
  await ui.unmount()
})

test('the stacked view keeps the original and mutes the translation under it, code once', async ($, on) => {
  const clock = mock.clock(on)
  fakeModel(on, ko)
  engineStandIn(on)
  await start($, on)
  await $.session.append({
    door: 'response',
    origin: { kind: 'model', model: 'claude' },
    uuid: 'r3',
    message: { type: 'assistant', role: 'assistant', content: [{ type: 'text', text: REPLY }] },
  } as never)
  await clock.advance(300)
  await clock.settle()
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'cc-trans',
      surface,
      component: 'AssistantMessage',
      requestId: 'r3',
      props: { text: REPLY, isFirstOfReply: true },
    } as never)
    const en1 = await ui.find({ type: 'Markdown', text: /^The loop calls/ })
    expect(en1?.text).toBe('The loop calls `fetchUser()` on every pass.')
    expect(en1?.props.dimColor).toBeUndefined()
    // the translation is plain text in the subtle color: no inline code colors
    expect(await ui.find({ type: 'Markdown', text: /루프가 매번/ })).toBeUndefined()
    const ko1 = await ui.find({ type: 'Text', text: /루프가 매번/ })
    expect(ko1?.text).toBe('루프가 매번 fetchUser()를 호출해요.')
    expect(ko1?.props.color).toBe('subtle')
    expect((await ui.find({ type: 'Markdown', text: /for \(const id/ }))?.text).toBe('```ts\nfor (const id of ids) await fetchUser(id)\n```')
    await ui.unmount()
  }
})

test('the side view draws each English block beside its translation from its own Markdown', { options: { view: 'side' } }, async ($, on) => {
  const clock = mock.clock(on)
  fakeModel(on, ko)
  engineStandIn(on)
  await start($, on)
  await $.session.append({
    door: 'response',
    origin: { kind: 'model', model: 'claude' },
    uuid: 'r4',
    message: { type: 'assistant', role: 'assistant', content: [{ type: 'text', text: REPLY }] },
  } as never)
  await clock.advance(300)
  await clock.settle()
  const ui = await $.ui.mount({
    plugin: 'cc-trans',
    surface: 'terminal',
    component: 'AssistantMessage',
    requestId: 'r4',
    props: { text: REPLY, isFirstOfReply: true },
  } as never)
  // the engine's own node may not sit in a sized Box, so the view draws the English itself
  expect((await ui.find({ type: 'Markdown', text: /^The loop calls/ }))?.text).toBe('The loop calls `fetchUser()` on every pass.')
  expect((await ui.find({ type: 'Text', text: /루프가 매번/ }))?.props.color).toBe('subtle')
  expect((await ui.find({ type: 'Markdown', text: /for \(const id/ }))?.text).toContain('for (const id of ids)')
  await ui.unmount()
})

test('plainText takes out inline marks and keeps list markers; plainLines splits the marker off', () => {
  expect(plainText('- **Promise.all**: `tasks`가 끝나면 [문서](https://x.y)를 보세요')).toBe('- Promise.all: tasks가 끝나면 문서를 보세요')
  expect(plainText('## 제목 `a`\n> 인용 *강조* snake_case_name a*b')).toBe('제목 a\n인용 강조 snake_case_name a*b')
  expect(plainText('``a `b` c`` 끝 ~~옛~~')).toBe('a `b` c 끝 옛')
  expect(plainLines('1. 첫째\n   - [x] 둘째\n이어지는 줄')).toEqual([
    { indent: '', marker: '1. ', text: '첫째' },
    { indent: '   ', marker: '- [x] ', text: '둘째' },
    { indent: '', marker: '', text: '이어지는 줄' },
  ])
})

test('stackedBlocks pairs each translated block with its English and leaves code alone', () => {
  const plan = planMarkdown(REPLY)
  const rows = stackedBlocks(plan, plan.units.map(u => `[ko] ${u.text}`))
  expect(rows.map(r => r.translation === null)).toEqual([false, false, true, false])
  expect(rows[1]?.original).toBe('The loop calls `fetchUser()` on every pass.')
  expect(rows[2]?.original).toContain('for (const id of ids)')
})

test('during a turn a block is translated once it stops changing, before the turn ends', async ($, on) => {
  const clock = mock.clock(on)
  const calls = fakeModel(on, ko)
  engineStandIn(on)
  on('turn.start', (_$, e) => e as never)
  await start($, on)
  await $.turn.start({ turnId: 't', prompt: 'x' } as never)
  const draw = (text: string) =>
    $.ui.mount({ plugin: 'cc-trans', surface: 'terminal', component: 'AssistantMessage', requestId: 'live', props: { text, isFirstOfReply: true } } as never)
  // streaming: the text grows
  for (const text of ['The loop', 'The loop calls `fetchUser()`', 'The loop calls `fetchUser()` on every pass.']) {
    await (await draw(text)).unmount()
    await clock.advance(100)
  }
  expect(calls).toHaveLength(0)
  await clock.advance(1000)
  await clock.settle()
  expect(calls).toEqual([['The loop calls ⟦0⟧ on every pass.']])
  const ui = await draw('The loop calls `fetchUser()` on every pass.')
  expect(await ui.find({ type: 'Text', text: /루프가 매번/ })).toBeDefined()
  await ui.unmount()
})

test('language codes come from codes, locales and names', () => {
  expect(toLanguageCode('ko')).toBe('ko')
  expect(toLanguageCode('ko_KR.UTF-8')).toBe('ko')
  expect(toLanguageCode('pt-BR')).toBe('pt')
  expect(toLanguageCode('Korean')).toBe('ko')
  expect(toLanguageCode('한국어')).toBe('ko')
  expect(toLanguageCode('日本語')).toBe('ja')
  expect(toLanguageCode('Japanese')).toBe('ja')
  expect(toLanguageCode('spanish')).toBe('es')
  expect(toLanguageCode('C')).toBeUndefined()
  expect(toLanguageCode('')).toBeUndefined()
  expect(toLanguageCode('Klingon')).toBeUndefined()
})

test('the option wins, then the language setting, then the locale, else English', () => {
  expect(pickLanguage('ja', 'Korean', ['de_DE.UTF-8'])).toEqual({ code: 'ja', from: 'option' })
  expect(pickLanguage('', 'Korean', ['de_DE.UTF-8'])).toEqual({ code: 'ko', from: 'setting' })
  expect(pickLanguage('', undefined, [undefined, 'de_DE.UTF-8'])).toEqual({ code: 'de', from: 'locale' })
  expect(pickLanguage('', undefined, ['C', undefined])).toEqual({ code: 'en', from: 'none' })
})

test('with Japanese set in Claude Code settings, Japanese prompts are translated and Korean ones are not', async ($, on) => {
  mock.clock(on)
  const calls = fakeModel(on, s => `[en] ${s}`)
  const sent: string[] = []
  on('prompt.submit', (_$, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  await start($, on, { settings: { language: 'Japanese' }, env: { LANG: 'ko_KR.UTF-8' } })
  await $.prompt.submit({ text: 'この関数はなぜ遅いですか', wait: false, origin: { kind: 'composer' } })
  await $.prompt.submit({ text: '이 함수 왜 느려', wait: false, origin: { kind: 'composer' } })
  expect(sent).toEqual(['[en] この関数はなぜ遅いですか', '이 함수 왜 느려'])
  expect(calls).toHaveLength(1)
})

test('with no language set anywhere nothing is translated', async ($, on) => {
  mock.clock(on)
  const calls = fakeModel(on, s => `[x] ${s}`)
  const sent: string[] = []
  on('prompt.submit', (_$, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  engineStandIn(on)
  await start($, on, { env: {} })
  await $.prompt.submit({ text: '이 함수 왜 느려', wait: false, origin: { kind: 'composer' } })
  await $.session.append({
    door: 'response',
    origin: { kind: 'model', model: 'claude' },
    uuid: 'r9',
    message: { type: 'assistant', role: 'assistant', content: [{ type: 'text', text: 'Some reply.' }] },
  } as never)
  expect(sent).toEqual(['이 함수 왜 느려'])
  expect(calls).toHaveLength(0)
})
