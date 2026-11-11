import { translateUnits, type EngineConfig, type Io } from '../src/engines.ts'
import { pickLanguage, toLanguageCode } from '../src/language.ts'
import { maskText, planMarkdown } from '../src/markdown.ts'
import { interleave, plainLines, plainText, stackedBlocks } from '../src/views.ts'
import { expect, test } from './expect.ts'

const REPLY = ['## Fix the loop', '', 'The loop calls `fetchUser()` on every pass.', '', '```ts', 'for (const id of ids) await fetchUser(id)', '```', '', 'Move it out:'].join('\n')

test('interleave keeps every original line and adds translations as quotes', () => {
  const plan = planMarkdown('- one item\n- two item\n\n| A | B |\n| --- | --- |\n| x y | z w |')
  const out = plan.units.map(u => `[ko] ${u.text}`)
  const text = interleave(plan, out)
  expect(text).toContain('- one item\n- two item\n> - [ko] one item\n> - [ko] two item')
  expect(text).toContain('| A | B |\n| --- | --- |\n| x y | z w |\n> | [ko] A | [ko] B |')
})

const CFG: EngineConfig = {
  kind: 'openai',
  model: '',
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

test('a failing external engine falls back to the Pi model, labelled model', async () => {
  const unit = maskText('Run `npm test` now')!
  const r = await translateUnits(io({}), CFG, [unit], 'en', 'ko')
  expect(r.engine).toBe('model')
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
    { ...CFG, kind: 'model' },
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

test('the option wins, then the locale, else English', () => {
  expect(pickLanguage('ja', ['de_DE.UTF-8'])).toEqual({ code: 'ja', from: 'option' })
  expect(pickLanguage('', [undefined, 'de_DE.UTF-8'])).toEqual({ code: 'de', from: 'locale' })
  expect(pickLanguage('', ['C', undefined])).toEqual({ code: 'en', from: 'none' })
})

test('literal lines show their text as is through Pi Markdown, colors included', async () => {
  const { Markdown } = await import('@earendil-works/pi-tui')
  const { getMarkdownTheme, initTheme } = await import('@earendil-works/pi-coding-agent')
  initTheme('dark')
  const { literalLines } = await import('../src/views.ts')
  const lines = [
    'nums.map(n => n * 2) and \\(x\\) or \\[y\\]',
    '[link](https://x.y) [^1] $a + b$ ~~no~~ *no* `no`',
    'path\\to\\file, 1. not a list',
    '  - indented, # not a heading',
    '\x1b[2mfaint\x1b[22;39m end',
  ]
  const shown = new Markdown(literalLines(lines), 0, 0, getMarkdownTheme()).render(120)
  const ansi = shown.join('\n')
  const plain = ansi.replace(/\x1b\[[0-?]*[ -/]*[@-~]|\x1b\]8;[^\x07]*\x07/g, '').replaceAll('\u00a0', ' ').split('\n').map(l => l.trimEnd())
  expect(plain).toEqual(lines.map(l => l.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')))
  expect(ansi).toContain('\x1b[2mfaint')
  expect(ansi).not.toContain('\x1b]8;;https')
})

test('a rendered translation stays faint after the colors inside it reset', async () => {
  const { getMarkdownTheme, initTheme } = await import('@earendil-works/pi-coding-agent')
  initTheme('dark')
  const { translationLines } = await import('../src/views.ts')
  const open = '\x1b[2m'
  const [line] = translationLines('**굵게** 그리고 `code` 끝', 60, getMarkdownTheme(), open)
  expect(line!.startsWith(open)).toBe(true)
  for (const m of line!.matchAll(/\x1b\[([0-9;]*)m/g)) {
    const codes = m[1]!.split(';')
    if (codes.includes('0') || codes.includes('22')) expect(line!.slice(m.index! + m[0].length).startsWith(open) || m.index! + m[0].length === line!.length).toBe(true)
  }
})
