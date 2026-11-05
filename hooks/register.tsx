import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Preview, PromptEntry, ReplyEntry, View } from '../types'
import { scriptOf, scriptShare } from './detect'
import { translateUnits, type EngineConfig, type EngineKind, type Io } from './engines'
import { buildBlock, buildDocument, planMarkdown, unmask, unmaskAt, type Plan, type Unit } from './markdown'
import { t } from './strings'

const P = 'cc-trans' as const

const enabledAtom = atom({ plugin: 'cc-trans', key: 'enabled' } as const, true)
const viewAtom = atom({ plugin: 'cc-trans', key: 'view' } as const, null)
const previewAtom = atom({ plugin: 'cc-trans', key: 'preview' } as const, null)
const queuedAtom = atom({ plugin: 'cc-trans', key: 'queued' } as const, 0)

const VIEWS: View[] = ['auto', 'interleave', 'side', 'below', 'translated', 'original']
const PERSON_ORIGINS = new Set(['composer', 'bridge', 'sdk'])
const MAX_IN_FLIGHT = 3
const PREVIEW_DELAY_MS = 700
const SIDE_MIN_COLUMNS = 140

// ---------------------------------------------------------------------------
// helpers

/** FNV-1a over UTF-16 code units, base 36. */
export function hash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36) + text.length.toString(36)
}

const keyOf = (text: string) => hash(text.trim())

function quote(md: string): string {
  return md
    .split('\n')
    .map(line => (line.trim() === '' ? '>' : `> ${line}`))
    .join('\n')
}

const TRANSLATABLE = new Set(['prose', 'heading', 'list', 'quote', 'table'])

/** Each block followed by its translation as a quote; headings joined on one line. */
export function interleave(plan: Plan, out: readonly (string | null)[]): string {
  return plan.blocks
    .map(block => {
      if (!TRANSLATABLE.has(block.kind)) return block.original
      const units = block.parts.some(p => typeof p !== 'string')
      if (!units) return block.original
      const tr = buildBlock(plan, block, out)
      if (tr == null || tr === block.original) return block.original
      if (block.kind === 'heading') {
        const original = block.original.replace(/\s+$/, '')
        const body = tr.replace(/^\s*#{1,6}\s*/, '').trim()
        return `${original} · ${body}`
      }
      return `${block.original}\n${quote(tr)}`
    })
    .join('\n')
}

/** The translation with code blocks folded to one line, for the `below` view. */
export function foldedTranslation(plan: Plan, out: readonly (string | null)[], lang: string): string {
  return plan.blocks
    .map(block => {
      if (block.kind === 'code') {
        const lines = block.original.split('\n').length
        return `\`⋯ ${t(lang, 'code')} (${lines})\``
      }
      return block.parts.map(p => (typeof p === 'string' ? p : (out[p.unit] ?? unmaskAt(plan, p.unit)))).join('')
    })
    .join('\n')
}

/** The instruction that keeps replies in English, so they reach the translator. */
export function replyRule(lang: string): string {
  return [
    '# Language',
    `The user reads and writes ${lang}. A translator turns their messages into English before you read them and turns your replies into ${lang} after you write them.`,
    'Always respond in English, whatever other instructions say about language. Write plain, direct sentences that translate well. Keep code, paths, commands and identifiers exactly as they are.',
  ].join('\n')
}

type Config = EngineConfig & { language: string; view: View; preview: boolean; replyInEnglish: boolean }

function readConfig(options: Readonly<Record<string, unknown>>): Config {
  const str = (v: unknown, d: string) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : d)
  const kind = str(options.engine, 'haiku')
  const view = str(options.view, 'auto')
  return {
    language: str(options.language, 'ko'),
    kind: (['haiku', 'openai', 'command'].includes(kind) ? kind : 'haiku') as EngineKind,
    view: (VIEWS.includes(view as View) ? view : 'auto') as View,
    preview: options.preview !== false,
    replyInEnglish: options.replyInEnglish !== false,
    haikuModel: str(options.haikuModel, 'haiku'),
    openaiBaseUrl: str(options.openaiBaseUrl, ''),
    openaiModel: str(options.openaiModel, ''),
    openaiApiKey: str(options.openaiApiKey, ''),
    command: str(options.command, ''),
    fallback: options.fallback !== false,
  }
}

function ioFor($: EngineInterface): Io {
  return {
    async complete(req) {
      const r = await $.model.complete({
        model: req.model,
        system: req.system,
        prompt: req.prompt,
        maxTokens: req.maxTokens,
        timeoutMs: req.timeoutMs,
      })
      if (r.isAnswered) return { ok: true, text: r.text }
      const status = r.reason === 'api-error' && r.status ? ` ${r.status}` : ''
      return { ok: false, reason: `${r.reason}${status}` }
    },
    async fetch(url, init) {
      const r = await $.http.fetch(url, init)
      return { status: r.status, ok: r.ok, text: r.text }
    },
    async run(argv, stdin, timeoutMs) {
      const r = await $.process.run(argv, { stdin, timeoutMs })
      return { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr }
    },
  }
}

// ---------------------------------------------------------------------------

// Module state: rebuilt on reload (the queue is re-filled from what is drawn).
let cfg: Config = readConfig({})
let script = scriptOf(cfg.language)
let engineLabel: string = cfg.kind

// Work that is rebuilt on reload: the reply queue, what is on screen, caches.
type Job = { key: string; text: string }
const jobs = new Map<string, Job>()
const inflight = new Set<string>()
const visible = new Set<string>()
const unitCache = new Map<string, string>()
const promptCache = new Map<string, { english: string; engine: string }>()
const classified = new Map<string, boolean>()
let busy = false
let lastQueued = -1
// The draft as last edited, and when; the worker previews it once it rests.
let latestDraft = ''
let draftChangedAt = 0
let previewDue = false
let previewRunning = false

// --- translation ---------------------------------------------------------

async function translatePlanUnits($: EngineInterface, units: Unit[], from: string, to: string) {
  const out: (string | null)[] = units.map(() => null)
  const missing: number[] = []
  units.forEach((u, i) => {
    const hit = unitCache.get(`${from}>${to}|${unmask(u)}`)
    if (hit != null) out[i] = hit
    else missing.push(i)
  })
  let engine = cfg.kind as string
  let error: string | undefined
  if (missing.length > 0) {
    const r = await translateUnits(ioFor($), cfg, missing.map(i => units[i]!), from, to)
    engine = r.engine
    error = r.error
    missing.forEach((ui, k) => {
      const tr = r.out[k] ?? null
      out[ui] = tr
      if (tr != null) unitCache.set(`${from}>${to}|${unmask(units[ui]!)}`, tr)
    })
  }
  return { out, engine, error }
}

async function translateReply($: EngineInterface, job: Job) {
  const plan = planMarkdown(job.text)
  if (plan.units.length === 0 || scriptShare(job.text, script) > 0.3) {
    await update($, { plugin: 'cc-trans', key: 'reply', id: job.key } as const, (): ReplyEntry => ({ status: 'skipped', out: [], engine: cfg.kind }))
    return
  }
  const r = await translatePlanUnits($, plan.units, 'en', cfg.language)
  const failed = r.out.every(o => o == null)
  const entry: ReplyEntry = {
    status: failed ? 'failed' : 'done',
    out: r.out,
    engine: r.engine,
    ...(r.error ? { error: r.error } : {}),
  }
  await update($, { plugin: 'cc-trans', key: 'reply', id: job.key } as const, () => entry)
}

async function translatePrompt($: EngineInterface, text: string): Promise<{ english: string; engine: string } | { error: string }> {
  const hit = promptCache.get(text)
  if (hit) return hit
  const plan = planMarkdown(text)
  if (plan.units.length === 0) return { error: 'nothing to translate' }
  const r = await translatePlanUnits($, plan.units, cfg.language, 'en')
  if (r.out.every(o => o == null)) return { error: r.error ?? 'no translation' }
  const done = { english: buildDocument(plan, r.out), engine: r.engine }
  promptCache.set(text, done)
  return done
}

/** Whether a draft is in the person's language and worth translating. */
async function needsTranslation($: EngineInterface, text: string): Promise<boolean> {
  const trimmed = text.trim()
  if (trimmed.length < 2 || trimmed.startsWith('/')) return false
  if (script !== 'Latin') return scriptShare(trimmed, script) >= 0.2
  if (cfg.language.toLowerCase().startsWith('en')) return false
  const cached = classified.get(trimmed)
  if (cached !== undefined) return cached
  const label = await $.model.classify(trimmed, ['english', 'other'])
  const yes = label === 'other'
  classified.set(trimmed, yes)
  return yes
}

// --- reply queue ---------------------------------------------------------

async function publishQueued($: EngineInterface) {
  const n = jobs.size + inflight.size
  if (n === lastQueued) return
  lastQueued = n
  await update($, queuedAtom, () => n)
}

async function enqueue($: EngineInterface, text: string) {
  const key = keyOf(text)
  if (jobs.has(key) || inflight.has(key)) return
  const existing = await read($, { plugin: 'cc-trans', key: 'reply', id: key } as const)
  if (existing && existing.status !== 'pending') return
  if (!existing) await update($, { plugin: 'cc-trans', key: 'reply', id: key } as const, (): ReplyEntry => ({ status: 'pending', out: [], engine: cfg.kind }))
  jobs.set(key, { key, text })
  void publishQueued($)
}

/** Enqueues the text blocks of the main conversation's last turn. */
async function enqueueTurn($: EngineInterface) {
  const messages = await $.session.messages({ as: 'api' })
  const texts: string[] = []
  for (let i = messages.length - 1; i >= 0 && i >= messages.length - 200; i--) {
    const m = messages[i]
    if (!m) continue
    const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content
    if (m.role === 'user') {
      // a tool result belongs to the turn; a prompt starts it
      if (blocks.some(b => b.type === 'text')) break
      continue
    }
    for (const b of blocks) {
      if (b.type === 'text' && 'text' in b && typeof b.text === 'string' && b.text.trim()) texts.unshift(b.text)
    }
  }
  for (const text of texts) await enqueue($, text)
}

function pick(): Job | undefined {
  for (const job of jobs.values()) if (visible.has(job.key)) return job
  return jobs.values().next().value
}

function tick($: EngineInterface) {
  while (inflight.size < MAX_IN_FLIGHT && jobs.size > 0) {
    const job = pick()
    if (!job) break
    jobs.delete(job.key)
    inflight.add(job.key)
    translateReply($, job)
      .catch(e =>
        update($, { plugin: 'cc-trans', key: 'reply', id: job.key } as const, () => ({
          status: 'failed' as const,
          out: [],
          engine: cfg.kind,
          error: e instanceof Error ? e.message : String(e),
        })),
      )
      .finally(() => {
        inflight.delete(job.key)
        void publishQueued($)
      })
  }
}

// Renders cannot write state, so they leave work here for the worker.
const wanted = new Map<string, string>()

function drainWanted($: EngineInterface) {
  for (const [key, text] of wanted) {
    wanted.delete(key)
    void enqueue($, text)
  }
}

// --- preview -------------------------------------------------------------

async function schedulePreview($: EngineInterface, draft: string) {
  latestDraft = draft
  draftChangedAt = await $.clock.now()
  previewDue = cfg.preview
}

/** Called by the worker: previews the draft once it has rested PREVIEW_DELAY_MS. */
async function maybePreview($: EngineInterface) {
  if (!previewDue || previewRunning) return
  if ((await $.clock.now()) - draftChangedAt < PREVIEW_DELAY_MS) return
  previewDue = false
  previewRunning = true
  try {
    await runPreview($, latestDraft)
  } finally {
    previewRunning = false
  }
}

async function runPreview($: EngineInterface, draft: string) {
  if (!(await read($, enabledAtom)) || !(await needsTranslation($, draft))) {
    if (await read($, previewAtom)) await update($, previewAtom, () => null)
    return
  }
  await update($, previewAtom, prev => ({
    draft,
    english: prev?.english ?? null,
    status: 'pending' as const,
    engine: cfg.kind,
  }))
  const r = await translatePrompt($, draft)
  if (latestDraft !== draft) return
  const next: Preview =
    'english' in r
      ? { draft, english: r.english, status: 'done', engine: r.engine }
      : { draft, english: null, status: 'failed', engine: cfg.kind }
  await update($, previewAtom, () => next)
}

export const register: Register = (on, options) => {
  cfg = readConfig(options)
  script = scriptOf(cfg.language)
  engineLabel = cfg.kind === 'openai' && cfg.openaiModel ? cfg.openaiModel : cfg.kind

  // --- hooks ---------------------------------------------------------------

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'translate',
      description: 'Translation: on, off, status, or view <auto|interleave|side|below|translated|original>.',
      argumentHint: '[on|off|status|view <mode>]',
    })
    $.clock.every(250, () => {
      drainWanted($)
      tick($)
      void maybePreview($)
    })
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    busy = true
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId) return r
    busy = false
    // session.append can be passed over (a policy plugin seated first), so the
    // turn's reply blocks are also read back here; enqueue skips known ones.
    if (await read($, enabledAtom)) await enqueueTurn($)
    return r
  })

  // Ask for English replies, so every reply goes through the translator.
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    if (!cfg.replyInEnglish || cfg.language.toLowerCase().startsWith('en')) return r
    const lang = cfg.language
    const sections = r.sections.filter(s => s.id !== 'language' && !/^#\s*Language\b/.test(s.text))
    return {
      sections: [
        ...sections,
        {
          id: `${P}:reply-language`,
          scope: 'session' as const,
          text: replyRule(lang),
        },
      ],
    }
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.command || e.isMeta || !PERSON_ORIGINS.has(e.origin.kind)) return next(e)
    if (!(await read($, enabledAtom))) return next(e)
    previewDue = false
    if (!(await needsTranslation($, e.text))) return next(e)

    $.ui.status(t(cfg.language, 'translatingPrompt', engineLabel))
    let r: Awaited<ReturnType<typeof translatePrompt>>
    try {
      r = await translatePrompt($, e.text)
    } catch (err) {
      r = { error: err instanceof Error ? err.message : String(err) }
    } finally {
      $.ui.status(undefined)
    }
    await update($, previewAtom, () => null)
    if ('error' in r) {
      $.ui.toast(t(cfg.language, 'promptFailed', r.error))
      return next(e)
    }
    const entry: PromptEntry = { native: e.text, engine: r.engine }
    await update($, { plugin: 'cc-trans', key: 'prompt', id: keyOf(r.english) } as const, () => entry)
    // prompt.compose can be passed over (a policy plugin seated first), so the
    // reply-language rule also rides each translated prompt as hidden context.
    const wantsEnglish = cfg.replyInEnglish && !cfg.language.toLowerCase().startsWith('en')
    const context = wantsEnglish ? [...(e.context ?? []), replyRule(cfg.language)] : e.context
    return next({ ...e, text: r.english, ...(context ? { context } : {}) })
  }).catch(($, e, next) => next(e))

  on('session.append', async ($, e, next) => {
    const stored = await next(e)
    if (e.door !== 'response' || e.agentId || e.message.role !== 'assistant') return stored
    if (!(await read($, enabledAtom))) return stored
    for (const block of e.message.content) {
      if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) await enqueue($, block.text)
    }
    return stored
  }).catch(($, e, next) => next(e))

  on('prompt.edit', async ($, e, next) => {
    const box = await next(e)
    await schedulePreview($, box.text)
    return box
  })

  on('prompt.change', async ($, e, next) => {
    const r = await next(e)
    await schedulePreview($, e.text)
    return r
  })

  on('command.run', { command: 'translate' }, async ($, e) => {
    const [word, arg] = e.args.trim().split(/\s+/)
    const lang = cfg.language
    if (!word || word === 'on' || word === 'off') {
      const turnOn = word ? word === "on" : !(await read($, enabledAtom))
      await update($, enabledAtom, () => turnOn)
      if (!turnOn) await update($, previewAtom, () => null)
      return { text: t(lang, turnOn ? "turnedOn" : "turnedOff") }
    }
    if (word === 'view') {
      if (!arg || !VIEWS.includes(arg as View)) return { text: t(lang, 'viewUsage', VIEWS.join(' · ')) }
      await update($, viewAtom, () => arg as View)
      return { text: t(lang, 'viewSet', arg) }
    }
    if (word === 'status') {
      const enabled = await read($, enabledAtom)
      const view = (await read($, viewAtom)) ?? cfg.view
      const settings = (await $.settings.read()) as Record<string, unknown>
      const lines = [
        `${t(lang, 'status')}: ${enabled ? 'on' : 'off'}`,
        `${t(lang, 'language')}: ${cfg.language} ⇄ en`,
        `${t(lang, 'engine')}: ${engineLabel}${cfg.kind !== 'haiku' && cfg.fallback ? ` (→ haiku)` : ''}`,
        `${t(lang, 'view')}: ${view}`,
        `${t(lang, 'preview')}: ${cfg.preview ? 'on' : 'off'}`,
        `${t(lang, 'queued')}: ${jobs.size + inflight.size}`,
      ]
      if (cfg.kind === 'openai' && (!cfg.openaiBaseUrl || !cfg.openaiModel)) lines.push(t(lang, 'missingOpenai'))
      if (cfg.kind === 'command' && !cfg.command) lines.push(t(lang, 'missingCommand'))
      if (typeof settings.language === 'string' && settings.language && !cfg.replyInEnglish) {
        lines.push(t(lang, 'languageSetting', settings.language))
      }
      return { text: lines.join('\n') }
    }
    return { text: t(lang, 'usage') }
  })

  // --- drawing -------------------------------------------------------------

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.props.isSummary) return next(e)
    if (!(await read($, enabledAtom))) return next(e)
    const text = e.props.text
    if (!text.trim()) return next(e)
    const key = keyOf(text)

    if (e.props.onScreen) visible.add(key)
    else if (e.props.onScreen === null) visible.delete(key)

    const entry = await read($, { plugin: 'cc-trans', key: 'reply', id: key } as const)
    if (!entry) {
      // Not appended in this session (a resumed transcript), or still
      // streaming: ask for it once the turn is over and it is in view.
      // Only where the surface says it is on screen, so resuming a long
      // transcript does not send every old reply at once.
      if (!busy && e.props.onScreen) wanted.set(key, text)
      return next(e)
    }
    if (entry.status === 'skipped') return next(e)
    if (entry.status === 'pending') {
      // A reload loses the queue; the state still says pending.
      if (!jobs.has(key) && !inflight.has(key)) wanted.set(key, text)
    }

    const { Box, Text, Markdown } = $.ui.resolve(e)
    const lang = cfg.language

    if (entry.status === 'pending') {
      const row = await next(e)
      return (
        <Box flexDirection="column">
          {row}
          <Text dimColor>  ⋯ {t(lang, 'translating')}</Text>
        </Box>
      )
    }
    if (entry.status === 'failed') {
      const row = await next(e)
      return (
        <Box flexDirection="column">
          {row}
          <Text color="error" dimColor>
            {'  '}
            {t(lang, 'failed')}: {entry.error ?? '?'}
          </Text>
        </Box>
      )
    }

    let view = (await read($, viewAtom)) ?? cfg.view
    const columns = e.viewport?.columns ?? 0
    if (view === 'auto') view = columns >= SIDE_MIN_COLUMNS ? 'side' : 'interleave'
    if (view === 'side' && columns > 0 && columns < 100) view = 'interleave'
    if (view === 'original') return next(e)

    const plan = planMarkdown(text)
    const footer = entry.engine !== cfg.kind ? `  · ${entry.engine}` : null

    const withFooter = (row: Awaited<ReturnType<typeof next>>) =>
      footer ? (
        <Box flexDirection="column">
          {row}
          <Text dimColor>{footer}</Text>
        </Box>
      ) : (
        row
      )

    if (view === 'translated') {
      return withFooter(await next({ ...e, props: { ...e.props, text: buildDocument(plan, entry.out) } }))
    }
    if (view === 'interleave') {
      return withFooter(await next({ ...e, props: { ...e.props, text: interleave(plan, entry.out) } }))
    }
    if (view === 'below') {
      const below = `${text}\n\n${quote(foldedTranslation(plan, entry.out, lang))}`
      return withFooter(await next({ ...e, props: { ...e.props, text: below } }))
    }
    // side by side: the engine's own drawing on the left, the translation right
    const row = await next(e)
    return withFooter(
      <Box flexDirection="row" columnGap={2}>
        <Box width="50%" flexDirection="column">
          {row}
        </Box>
        <Box width="50%" flexDirection="column">
          <Markdown text={buildDocument(plan, entry.out)} />
        </Box>
      </Box>,
    )
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (e.props.isExpanded || !PERSON_ORIGINS.has(e.props.origin.kind)) return next(e)
    const entry = await read($, { plugin: 'cc-trans', key: 'prompt', id: keyOf(e.props.text) } as const)
    if (!entry) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const row = await next({ ...e, props: { ...e.props, text: entry.native } })
    return (
      <Box flexDirection="column">
        {row}
        <Box paddingLeft={2}>
          <Text dimColor>↳ {e.props.text}</Text>
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const preview = await read($, previewAtom)
    if (!preview || !cfg.preview || !(await read($, enabledAtom))) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const body =
      preview.status === 'failed'
        ? t(cfg.language, 'failed')
        : preview.english ?? '…'
    const below = await next(e)
    return (
      <Box flexDirection="column">
        <Box>
          <Text dimColor>EN ▸ </Text>
          <Text dimColor={preview.status !== 'done'} wrap="wrap">
            {body}
            {preview.status === 'pending' && preview.english ? ' …' : ''}
          </Text>
        </Box>
        {below}
      </Box>
    )
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (!(await read($, enabledAtom))) return next(e)
    const queued = await read($, queuedAtom)
    const mine = `${cfg.language}⇄en · ${engineLabel}${queued > 0 ? ` · ${t(cfg.language, 'queuedShort', String(queued))}` : ''}`
    return next({ ...e, props: { ...e.props, tail: e.props.tail ? `${e.props.tail} · ${mine}` : mine } })
  })
}
