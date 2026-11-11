// How a translated reply is drawn. Pi draws assistant text through its own
// Markdown renderer, so every view is Markdown: the plain ones rewrite the
// text, and the ones laid out in columns or indented are rendered here with
// Pi's Markdown component and handed over as literal lines (punctuation
// escaped, joined by hard breaks) that the renderer prints as they are.

import { Markdown, truncateToWidth, visibleWidth, wrapTextWithAnsi, type MarkdownTheme } from '@earendil-works/pi-tui'

import { buildBlock, unmaskAt, type Plan } from './markdown.ts'
import { t } from './strings.ts'

/** Colors a line for the terminal. */
export type Paint = (text: string) => string

/** FNV-1a over UTF-16 code units, base 36. */
export function hash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36) + text.length.toString(36)
}

export const keyOf = (text: string) => hash(text.trim())

export function quote(md: string): string {
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

/**
 * A translated block as plain text: Markdown's inline marks taken out (code
 * ticks, emphasis, link targets, heading and quote markers), list markers and
 * line breaks kept. The stacked and side views draw it in one muted color, so
 * nothing in it (inline code colors, bold) pulls the eye from the original.
 */
export function plainText(md: string): string {
  return md
    .split('\n')
    .map(line =>
      line
        .replace(/^(\s*)(?:>\s?)+/, '$1')
        .replace(/^(\s*)#{1,6}\s+/, '$1')
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]+)\](?:\([^)]*\)|\[[^\]]*\])/g, '$1')
        .replace(/(`+)(.+?)\1/g, (_m, _t, code: string) => code.trim())
        .replace(/(\*\*|__|~~)(?=\S)(.+?)(?<=\S)\1/g, '$2')
        .replace(/(^|[^*\w])\*(?=\S)([^*]+?)(?<=\S)\*(?![*\w])/g, '$1$2'),
    )
    .join('\n')
}

/**
 * The lines of a translated block for drawing: a list item's marker apart from
 * its text, so a wrapped item keeps its hanging indent.
 */
export function plainLines(md: string): { indent: string; marker: string; text: string }[] {
  return plainText(md)
    .split('\n')
    .map(line => {
      const m = /^(\s*)((?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)?(.*)$/.exec(line)
      return { indent: m?.[1] ?? '', marker: m?.[2] ?? '', text: m?.[3] ?? line }
    })
}

/** Blocks for the stacked and side views: the original, and its translation where there is one. */
export function stackedBlocks(plan: Plan, out: readonly (string | null)[]): { original: string; translation: string | null }[] {
  return plan.blocks
    .filter(block => block.kind !== 'blank')
    .map(block => {
      if (!TRANSLATABLE.has(block.kind) || !block.parts.some(p => typeof p !== 'string')) {
        return { original: block.original, translation: null }
      }
      const tr = buildBlock(plan, block, out)
      if (tr == null || tr === block.original) return { original: block.original, translation: null }
      return { original: block.original, translation: tr }
    })
}

/** The translation with code blocks folded to one line, for the `below` view. */
export function foldedTranslation(plan: Plan, out: readonly (string | null)[]): string {
  return plan.blocks
    .map(block => {
      if (block.kind === 'code') {
        const lines = block.original.split('\n').length
        return `\`⋯ ${t('code')} (${lines})\``
      }
      return block.parts.map(p => (typeof p === 'string' ? p : (out[p.unit] ?? unmaskAt(plan, p.unit)))).join('')
    })
    .join('\n')
}

// --- literal lines -----------------------------------------------------------

const NBSP = '\u00a0'
// SGR color codes are kept; OSC 8 hyperlinks are dropped, their URLs would be
// read as autolinks.
const ESCAPES = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g

/**
 * One drawn line as Markdown that renders back to the same line. Without
 * `escape` the punctuation is left as is, for text already free of Markdown
 * (Pi keeps backslash escapes visible in user messages).
 */
export function literalLine(line: string, escape = true): string {
  let out = ''
  let at = 0
  // `\(` and `\[` would open LaTeX math, so parentheses and `[` stay bare:
  // with every `]` escaped, no link or footnote can close.
  const text = (s: string) => (escape ? s.replace(/[!-'*-/:-@\\-`{-~]/g, '\\$&') : s)
  for (const m of line.matchAll(ESCAPES)) {
    out += text(line.slice(at, m.index))
    if (m[0].startsWith('\x1b[')) out += m[0]
    at = m.index + m[0].length
  }
  out += text(line.slice(at))
  // Leading spaces would be read as indentation (four make a code block).
  out = out.replace(/^((?:\x1b\[[0-?]*[ -/]*[@-~])*)( +)/, (_, sgr: string, s: string) => sgr + NBSP.repeat(s.length))
  return out.trim() === '' ? NBSP : out
}

/** Drawn lines as one Markdown paragraph of hard-broken lines. */
export function literalLines(lines: readonly string[], escape = true): string {
  return lines.map(l => literalLine(l, escape)).join('\\\n')
}

/** Wraps a line to `width`, `head` before the first row and its width in spaces before the rest. */
function hanging(text: string, width: number, head: string): string[] {
  const room = Math.max(8, width - visibleWidth(head))
  const rows = text ? wrapTextWithAnsi(text, room) : ['']
  const pad = ' '.repeat(visibleWidth(head))
  return rows.map((row, i) => (i === 0 ? head : pad) + row)
}

/** True when an SGR parameter list turns off intensity or the foreground color. */
function resetsTint(params: string): boolean {
  const p = params === '' ? [0] : params.split(';').map(Number)
  for (let i = 0; i < p.length; i++) {
    const n = p[i]
    if (n === 38 || n === 48 || n === 58) i += p[i + 1] === 5 ? 2 : 4
    else if (n === 0 || n === 22 || n === 39) return true
  }
  return false
}

/** Keeps `open` (a color, maybe faint) in force across a line, after every code that turns it off. */
function tint(line: string, open: string): string {
  const body = line.replace(/\x1b\[([0-9;]*)m/g, (code, params: string) => (resetsTint(params) ? code + open : code))
  return `${open}${body}\x1b[22;39m`
}

/** A translated block rendered by Pi's Markdown renderer at `width`, tinted with `open`. */
export function translationLines(md: string, width: number, theme: MarkdownTheme, open: string): string[] {
  const lines = new Markdown(md, 0, 0, theme).render(width).map(l => l.replace(/ +$/, ''))
  while (lines.length > 0 && lines.at(-1) === '') lines.pop()
  return lines.map(l => tint(l, open))
}

/** Text drawn under a message: `head` then the text, wrapped with a hanging indent. */
export function noteLines(text: string, width: number, head: string, paint: Paint): string[] {
  return text.split('\n').flatMap((line, i) => hanging(line, width, i === 0 ? head : ' '.repeat(visibleWidth(head))).map(paint))
}

// --- views -------------------------------------------------------------------

const INDENT = 2
const RIGHT = 4
const GAP = 3

/**
 * Each block as written, its translation right under it, faint, indented and
 * narrower; code and other untranslated blocks once, as they are.
 */
export function stackedView(plan: Plan, out: readonly (string | null)[], width: number, theme: MarkdownTheme, open: string): string {
  return stackedBlocks(plan, out)
    .map(r => {
      const original = r.original.replace(/\s+$/, '')
      if (r.translation === null) return original
      const lines = translationLines(r.translation, width - INDENT - RIGHT, theme, open).map(l => ' '.repeat(INDENT) + l)
      return `${original}\n\n${literalLines(lines)}`
    })
    .join('\n\n')
}

/**
 * Side by side, block by block: the English left, drawn by Pi's Markdown
 * renderer at half the width, its translation right; code and other
 * untranslated blocks once, across the whole width.
 */
export function sideView(plan: Plan, out: readonly (string | null)[], width: number, theme: MarkdownTheme, open: string): string {
  const left = Math.floor((width - GAP) / 2)
  const right = width - GAP - left
  return stackedBlocks(plan, out)
    .map(r => {
      const original = r.original.replace(/\s+$/, '')
      if (r.translation === null) return original
      const l = new Markdown(original, 0, 0, theme).render(left)
      const rt = translationLines(r.translation, right, theme, open)
      const rows: string[] = []
      for (let i = 0; i < Math.max(l.length, rt.length); i++) {
        const cell = truncateToWidth(l[i] ?? '', left, '', true)
        rows.push((rt[i] ? cell + ' '.repeat(GAP) + rt[i] : cell).replace(/ +$/, ''))
      }
      return literalLines(rows)
    })
    .join('\n\n')
}

/** The reply, then the whole translation as a quote, code folded. */
export function belowView(text: string, plan: Plan, out: readonly (string | null)[]): string {
  return `${text}\n\n${quote(foldedTranslation(plan, out))}`
}
