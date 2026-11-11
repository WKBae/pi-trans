// pi-trans for Pi: prompts typed in the person's language go out in English,
// replies come back with a translation, code untouched.

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Api, Model } from '@earendil-works/pi-ai'
import type { ExtensionAPI, ExtensionContext, ExtensionUIContext, MarkdownTransformContext } from '@earendil-works/pi-coding-agent'
import { getAgentDir, getMarkdownTheme } from '@earendil-works/pi-coding-agent'
import { truncateToWidth, wrapTextWithAnsi, type Component, type TUI } from '@earendil-works/pi-tui'

import { scriptOf, scriptShare, type Script } from './detect.ts'
import { isEnglish, translateUnits, type EngineConfig, type EngineKind, type Io } from './engines.ts'
import { pickLanguage } from './language.ts'
import { buildDocument, planMarkdown, unmask, type Unit } from './markdown.ts'
import { t } from './strings.ts'
import { VIEWS, type Preview, type PromptEntry, type ReplyEntry, type Saved, type View } from './types.ts'
import { belowView, interleave, keyOf, literalLines, noteLines, plainText, sideView, stackedView } from './views.ts'

const NAME = 'pi-trans'
const TICK_MS = 250
const MAX_IN_FLIGHT = 3
const PREVIEW_DELAY_MS = 700
const SIDE_MIN_COLUMNS = 140
const SIDE_MIN_WIDTH = 100
/** On resume, the last replies without a translation are translated; older ones are left alone. */
const RESUME_REPLIES = 10

export type Config = EngineConfig & { languageOption: string; view: View; preview: boolean }

export function readConfig(options: Readonly<Record<string, unknown>>): Config {
  const str = (v: unknown, d: string) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : d)
  const kind = str(options.engine, 'model')
  const view = str(options.view, 'auto')
  return {
    languageOption: str(options.language, ''),
    kind: (['model', 'openai', 'command'].includes(kind) ? kind : 'model') as EngineKind,
    view: (VIEWS.includes(view as View) ? view : 'auto') as View,
    preview: options.preview !== false,
    model: str(options.model, ''),
    openaiBaseUrl: str(options.openaiBaseUrl, ''),
    openaiModel: str(options.openaiModel, ''),
    openaiApiKey: str(options.openaiApiKey, ''),
    command: str(options.command, ''),
    fallback: options.fallback !== false,
  }
}

/** The options file, `~/.pi/agent/pi-trans.json`; missing or unreadable means defaults. */
function loadOptions(): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(readFileSync(join(getAgentDir(), `${NAME}.json`), 'utf8'))
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/**
 * The model for the model engine: `provider/id` or a bare id when set, else a
 * Haiku model with credentials (the session's provider first), else the
 * session's model.
 */
export function resolveModel(ctx: Pick<ExtensionContext, 'model' | 'modelRegistry'>, spec: string): Model<Api> | undefined {
  const registry = ctx.modelRegistry
  if (spec) {
    const slash = spec.indexOf('/')
    if (slash > 0) return registry.find(spec.slice(0, slash), spec.slice(slash + 1))
    return registry.getAvailable().find(m => m.id === spec) ?? registry.getAll().find(m => m.id === spec)
  }
  const haiku = registry.getAvailable().filter(m => /haiku/i.test(m.id))
  return haiku.find(m => m.provider === ctx.model?.provider) ?? haiku[0] ?? ctx.model
}

function ioFor(ctx: Pick<ExtensionContext, 'model' | 'modelRegistry'>): Io {
  return {
    async complete(req) {
      const model = resolveModel(ctx, req.model)
      if (!model) return { ok: false, reason: req.model ? `no model ${req.model}` : 'no model' }
      try {
        const reply = await ctx.modelRegistry.complete(
          model,
          { systemPrompt: req.system, messages: [{ role: 'user', content: [{ type: 'text', text: req.prompt }], timestamp: Date.now() }] },
          { maxTokens: req.maxTokens, signal: AbortSignal.timeout(req.timeoutMs) },
        )
        if (reply.stopReason === 'error' || reply.stopReason === 'aborted') return { ok: false, reason: reply.errorMessage ?? reply.stopReason }
        const text = reply.content.map(c => (c.type === 'text' ? c.text : '')).join('')
        return { ok: true, text }
      } catch (e) {
        return { ok: false, reason: e instanceof Error ? e.message : String(e) }
      }
    },
    async fetch(url, init) {
      const r = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) })
      return { status: r.status, ok: r.ok, text: await r.text() }
    },
    run(argv, stdin, timeoutMs) {
      return new Promise(resolve => {
        const [cmd, ...args] = argv
        const child = spawn(cmd!, args, { stdio: ['pipe', 'pipe', 'pipe'], timeout: timeoutMs })
        let stdout = ''
        let stderr = ''
        child.stdout.setEncoding('utf8').on('data', (d: string) => (stdout += d))
        child.stderr.setEncoding('utf8').on('data', (d: string) => (stderr += d))
        child.on('error', e => resolve({ exitCode: 127, stdout, stderr: e.message }))
        child.on('close', code => resolve({ exitCode: code ?? 1, stdout, stderr }))
        child.stdin.on('error', () => {})
        child.stdin.end(stdin)
      })
    },
  }
}

export default function piTrans(pi: ExtensionAPI) {
  let cfg = readConfig({})
  let language = 'en'
  let languageFrom: 'option' | 'locale' | 'none' = 'none'
  let script: Script = scriptOf(language)
  let enabled = true
  let viewOverride: View | null = null

  // The live session; replaced on every session_start.
  let session: ExtensionContext | undefined
  let ui: ExtensionUIContext | undefined
  let tui: TUI | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  // Bumped per session, so work started for an earlier one is dropped.
  let generation = 0

  const replies = new Map<string, ReplyEntry>()
  const prompts = new Map<string, PromptEntry>()
  const unitCache = new Map<string, string>()
  const promptCache = new Map<string, { english: string; engine: string }>()
  const classified = new Map<string, boolean>()

  type Job = { key: string; text: string }
  const jobs = new Map<string, Job>()
  const inflight = new Set<string>()

  let preview: Preview | null = null
  let latestDraft = ''
  let draftChangedAt = 0
  let previewDue = false
  let previewRunning = false

  let repaint = false
  let rerender = false

  /** English readers have nothing to translate. */
  const idle = () => language.toLowerCase().startsWith('en')
  const active = () => enabled && !idle()
  const io = () => ioFor(session!)

  function engineLabel(): string {
    if (cfg.kind === 'openai') return cfg.openaiModel || 'openai'
    if (cfg.kind === 'command') return 'command'
    return (session && resolveModel(session, cfg.model)?.id) || cfg.model || 'model'
  }

  function updateStatus() {
    if (!ui) return
    if (!active()) return ui.setStatus(NAME, undefined)
    const queued = jobs.size + inflight.size
    ui.setStatus(NAME, `${language}↔en · ${engineLabel()}${queued > 0 ? ` · ${t('queuedShort', String(queued))}` : ''}`)
  }

  /** Redraws the transcript once per tick after translations change. */
  function flush() {
    if (repaint) tui?.invalidate()
    if (repaint || rerender) tui?.requestRender()
    repaint = false
    rerender = false
  }

  // --- translation -----------------------------------------------------------

  async function translatePlanUnits(units: Unit[], from: string, to: string) {
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
      const r = await translateUnits(io(), cfg, missing.map(i => units[i]!), from, to)
      engine = r.engine
      error = r.error
      missing.forEach((at, k) => {
        const tr = r.out[k] ?? null
        out[at] = tr
        if (tr != null) unitCache.set(`${from}>${to}|${unmask(units[at]!)}`, tr)
      })
    }
    return { out, engine, error }
  }

  async function translateReply(job: Job): Promise<ReplyEntry> {
    const plan = planMarkdown(job.text)
    if (plan.units.length === 0 || scriptShare(job.text, script) > 0.3) return { status: 'skipped', out: [], engine: cfg.kind }
    const r = await translatePlanUnits(plan.units, 'en', language)
    const failed = r.out.every(o => o == null)
    return { status: failed ? 'failed' : 'done', out: r.out, engine: r.engine, ...(r.error ? { error: r.error } : {}) }
  }

  async function translatePrompt(text: string): Promise<{ english: string; engine: string } | { error: string }> {
    const hit = promptCache.get(text)
    if (hit) return hit
    const plan = planMarkdown(text)
    if (plan.units.length === 0) return { error: 'nothing to translate' }
    let r = await translatePlanUnits(plan.units, language, 'en')
    // A prompt is worth a second try: the lines that came back go from the cache,
    // only the ones that failed are sent again.
    if (r.out.some(o => o == null)) r = await translatePlanUnits(plan.units, language, 'en')
    if (r.out.every(o => o == null)) return { error: r.error ?? 'no translation' }
    const done = { english: buildDocument(plan, r.out), engine: r.engine }
    promptCache.set(text, done)
    return done
  }

  /** Whether a draft is in the person's language and worth translating. */
  async function needsTranslation(text: string): Promise<boolean> {
    const trimmed = text.trim()
    if (trimmed.length < 2 || trimmed.startsWith('/') || trimmed.startsWith('!')) return false
    if (!active()) return false
    if (script !== 'Latin') return scriptShare(trimmed, script) >= 0.2
    const cached = classified.get(trimmed)
    if (cached !== undefined) return cached
    const english = await isEnglish(io(), cfg, trimmed)
    if (english === undefined) return false
    classified.set(trimmed, !english)
    return !english
  }

  // --- reply queue -----------------------------------------------------------

  function enqueue(text: string) {
    if (!active() || session?.mode !== 'tui') return
    const key = keyOf(text)
    if (jobs.has(key) || inflight.has(key)) return
    const existing = replies.get(key)
    if (existing && existing.status !== 'pending') return
    replies.set(key, { status: 'pending', out: [], engine: cfg.kind })
    jobs.set(key, { key, text })
    repaint = true
    updateStatus()
  }

  function textBlocks(message: unknown): string[] {
    const m = message as { role?: string; content?: unknown }
    if (m?.role !== 'assistant' || !Array.isArray(m.content)) return []
    return m.content.flatMap((b: { type?: string; text?: unknown }) =>
      b?.type === 'text' && typeof b.text === 'string' && b.text.trim() ? [b.text] : [],
    )
  }

  /** The last replies of the current branch that have no translation yet. */
  function enqueueRecent(ctx: ExtensionContext) {
    const texts: string[] = []
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === 'message') texts.push(...textBlocks(entry.message))
    }
    const missing = texts.filter(text => !replies.has(keyOf(text))).slice(-RESUME_REPLIES)
    for (const text of missing) enqueue(text)
  }

  /** The newest job first: it is the one at the bottom of the transcript, on screen. */
  function pick(): Job | undefined {
    let last: Job | undefined
    for (const job of jobs.values()) last = job
    return last
  }

  function tick() {
    const gen = generation
    while (inflight.size < MAX_IN_FLIGHT && jobs.size > 0) {
      const job = pick()
      if (!job) break
      jobs.delete(job.key)
      inflight.add(job.key)
      translateReply(job)
        .catch((e): ReplyEntry => ({ status: 'failed', out: [], engine: cfg.kind, error: e instanceof Error ? e.message : String(e) }))
        .then(entry => {
          if (gen !== generation) return
          replies.set(job.key, entry)
          if (entry.status === 'done') pi.appendEntry<Saved>(NAME, { kind: 'reply', key: job.key, out: entry.out, engine: entry.engine })
          repaint = true
        })
        .finally(() => {
          if (gen !== generation) return
          inflight.delete(job.key)
          updateStatus()
        })
    }
    watchDraft()
    void maybePreview()
    flush()
  }

  // --- preview ---------------------------------------------------------------

  function watchDraft() {
    const draft = ui?.getEditorText() ?? ''
    if (draft === latestDraft) return
    latestDraft = draft
    draftChangedAt = Date.now()
    previewDue = cfg.preview
    if (!draft.trim() && preview) {
      preview = null
      rerender = true
    }
  }

  async function maybePreview() {
    if (!previewDue || previewRunning) return
    if (Date.now() - draftChangedAt < PREVIEW_DELAY_MS) return
    previewDue = false
    previewRunning = true
    const gen = generation
    try {
      await runPreview(latestDraft, gen)
    } catch {
      // the preview is a courtesy; Enter still translates
    } finally {
      previewRunning = false
    }
  }

  async function runPreview(draft: string, gen: number) {
    if (!(await needsTranslation(draft))) {
      if (preview) {
        preview = null
        rerender = true
      }
      return
    }
    preview = { draft, english: preview?.english ?? null, status: 'pending', engine: cfg.kind }
    rerender = true
    const r = await translatePrompt(draft)
    if (gen !== generation || latestDraft !== draft) return
    preview = 'english' in r ? { draft, english: r.english, status: 'done', engine: r.engine } : { draft, english: null, status: 'failed', engine: cfg.kind }
    rerender = true
  }

  /** The `EN ▸` line above the editor; empty when there is nothing to preview. */
  const previewLine: Component = {
    render(width: number) {
      if (!preview || !cfg.preview || !active() || !ui) return []
      const theme = ui.theme
      const body = preview.status === 'failed' ? t('failed') : (preview.english ?? '…')
      const more = preview.status === 'pending' && preview.english ? ' …' : ''
      const text = theme.fg('dim', 'EN ▸ ') + (preview.status === 'done' ? body : theme.fg('dim', body)) + more
      return wrapTextWithAnsi(text, Math.max(10, width - 2)).map(line => truncateToWidth(` ${line}`, width))
    },
    invalidate() {},
  }

  // --- drawing ---------------------------------------------------------------

  function chooseView(width: number): View {
    let view = viewOverride ?? cfg.view
    if (view === 'auto') view = width >= SIDE_MIN_COLUMNS ? 'side' : 'stacked'
    if (view === 'side' && width < SIDE_MIN_WIDTH) view = 'stacked'
    return view
  }

  function drawReply(text: string, width: number): string {
    if (!active() || !ui || !text.trim()) return text
    const entry = replies.get(keyOf(text))
    if (!entry || entry.status === 'skipped') return text
    const theme = ui.theme
    const note = (line: string, color: 'dim' | 'error' = 'dim') => `${text}\n\n${literalLines([theme.fg(color, `  ${line}`)])}`
    if (entry.status === 'pending') return note(`⋯ ${t('translating')}`)
    if (entry.status === 'failed') return note(`${t('failed')}: ${entry.error ?? '?'}`, 'error')

    const view = chooseView(width)
    if (view === 'original') return text
    const plan = planMarkdown(text)
    const faint = theme.getFgAnsi('dim')
    let md: string
    if (view === 'translated') md = buildDocument(plan, entry.out)
    else if (view === 'interleave') md = interleave(plan, entry.out)
    else if (view === 'below') md = belowView(text, plan, entry.out)
    else if (view === 'side') md = sideView(plan, entry.out, width, getMarkdownTheme(), faint)
    else md = stackedView(plan, entry.out, width, getMarkdownTheme(), faint)
    if (entry.engine !== cfg.kind) md += `\n\n${literalLines([theme.fg('dim', `  · ${entry.engine}`)])}`
    return md
  }

  /** A prompt sent in English is shown as typed, the English dim under it as plain text. */
  function drawPrompt(text: string, width: number): string {
    const entry = prompts.get(keyOf(text))
    if (!entry || !ui) return text
    const dim = (s: string) => ui!.theme.fg('dim', s)
    return `${entry.native}\n\n${literalLines(noteLines(plainText(text.trim()), width - 2, '↳ ', dim).map(l => `  ${l}`), false)}`
  }

  pi.registerMarkdownTransformer(
    (markdown: string, context: MarkdownTransformContext) =>
      context.messageType === 'user' ? drawPrompt(markdown, context.availableWidth) : drawReply(markdown, context.availableWidth),
    { messageTypes: ['user', 'assistant'] },
  )

  // --- events ----------------------------------------------------------------

  function stop() {
    if (timer) clearInterval(timer)
    timer = undefined
    generation++
    jobs.clear()
    inflight.clear()
    preview = null
    previewDue = false
    latestDraft = ''
    session = undefined
    ui = undefined
    tui = undefined
  }

  pi.on('session_start', async (_event, ctx) => {
    stop()
    session = ctx
    ui = ctx.ui
    cfg = readConfig(loadOptions())
    const picked = pickLanguage(cfg.languageOption, [process.env.LC_ALL, process.env.LC_MESSAGES, process.env.LANG])
    language = picked.code
    languageFrom = picked.from
    script = scriptOf(language)

    replies.clear()
    prompts.clear()
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type !== 'custom' || entry.customType !== NAME) continue
      const saved = entry.data as Saved | undefined
      if (saved?.kind === 'reply') replies.set(saved.key, { status: 'done', out: saved.out, engine: saved.engine })
      else if (saved?.kind === 'prompt') prompts.set(saved.key, { native: saved.native, engine: saved.engine })
    }

    if (ctx.mode === 'tui') {
      ctx.ui.setWidget(
        NAME,
        tuiRef => {
          tui = tuiRef
          return previewLine
        },
        { placement: 'aboveEditor' },
      )
      timer = setInterval(tick, TICK_MS)
      timer.unref?.()
      enqueueRecent(ctx)
    }
    updateStatus()
  })

  pi.on('session_shutdown', async () => {
    stop()
  })

  // A text block is translated as soon as it ends, while the same reply may
  // still be streaming a tool call; message_end covers providers that skip
  // text_end.
  pi.on('message_update', async event => {
    const e = event.assistantMessageEvent
    if (e.type === 'text_end' && e.content.trim()) enqueue(e.content)
  })

  pi.on('message_end', async event => {
    for (const text of textBlocks(event.message)) enqueue(text)
  })

  pi.on('input', async (event, ctx) => {
    if (event.source === 'extension' || !active()) return { action: 'continue' }
    previewDue = false
    if (!(await needsTranslation(event.text))) return { action: 'continue' }

    ctx.ui.setStatus(NAME, t('translatingPrompt', engineLabel()))
    let r: Awaited<ReturnType<typeof translatePrompt>>
    try {
      r = await translatePrompt(event.text)
    } catch (err) {
      r = { error: err instanceof Error ? err.message : String(err) }
    } finally {
      updateStatus()
    }
    if (preview) {
      preview = null
      rerender = true
    }
    if ('error' in r) {
      ctx.ui.notify(t('promptFailed', r.error), 'warning')
      return { action: 'continue' }
    }
    const key = keyOf(r.english)
    prompts.set(key, { native: event.text, engine: r.engine })
    pi.appendEntry<Saved>(NAME, { kind: 'prompt', key, native: event.text, engine: r.engine })
    // Only the prompt changes: asked in English, the model answers in English.
    return { action: 'transform', text: r.english }
  })

  // --- /translate --------------------------------------------------------------

  const WORDS = ['on', 'off', 'status', 'view']

  pi.registerCommand('translate', {
    description: 'Translation: on, off, status, or view <auto|stacked|interleave|side|below|translated|original>.',
    getArgumentCompletions(prefix: string) {
      const [word, arg] = prefix.split(/\s+/)
      if (word === 'view' && arg !== undefined) {
        return VIEWS.filter(v => v.startsWith(arg)).map(v => ({ value: `view ${v}`, label: v }))
      }
      const items = WORDS.filter(w => w.startsWith(word ?? '')).map(w => ({ value: w, label: w }))
      return items.length > 0 ? items : null
    },
    async handler(args, ctx) {
      const [word, arg] = args.trim().split(/\s+/)
      const say = (text: string) => ctx.ui.notify(text, 'info')
      if (!word || word === 'on' || word === 'off') {
        enabled = word ? word === 'on' : !enabled
        if (!enabled) preview = null
        else enqueueRecent(ctx)
        repaint = true
        updateStatus()
        flush()
        return say(t(enabled ? 'turnedOn' : 'turnedOff'))
      }
      if (word === 'view') {
        if (!arg || !VIEWS.includes(arg as View)) return say(t('viewUsage', VIEWS.join(' · ')))
        viewOverride = arg as View
        repaint = true
        flush()
        return say(t('viewSet', arg))
      }
      if (word === 'status') {
        const lines = [
          `${t('status')}: ${enabled ? 'on' : 'off'}`,
          `${t('language')}: ${language} ↔ en (${t(`from_${languageFrom}`)})`,
          `${t('engine')}: ${engineLabel()}${cfg.kind !== 'model' && cfg.fallback ? ' (→ model)' : ''}`,
          `${t('view')}: ${viewOverride ?? cfg.view}`,
          `${t('preview')}: ${cfg.preview ? 'on' : 'off'}`,
          `${t('queued')}: ${jobs.size + inflight.size}`,
        ]
        if (cfg.kind === 'openai' && (!cfg.openaiBaseUrl || !cfg.openaiModel)) lines.push(t('missingOpenai'))
        if (cfg.kind === 'command' && !cfg.command) lines.push(t('missingCommand'))
        if ((cfg.kind === 'model' || cfg.fallback) && !resolveModel(ctx, cfg.model)) lines.push(t('missingModel'))
        return say(lines.join('\n'))
      }
      return say(t('usage'))
    },
  })
}
