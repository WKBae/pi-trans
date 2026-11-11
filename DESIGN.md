# pi-trans — design

A Pi extension that lets a person write and read in their own language while the agent works in English.
Prompts typed in the person's language are sent to the model in English; the model's English replies are
shown with a translation. Code, paths, commands and Markdown structure never go through the translator.

Files: `src/index.ts` (the extension: events, queue, drawing), `src/markdown.ts` (units), `src/engines.ts`,
`src/views.ts` (the views as Markdown), `src/detect.ts`, `src/language.ts`, `src/strings.ts`, `src/types.ts`.

## 1. Translation unit model (`src/markdown.ts`)

The translator never sees a whole Markdown document. `planMarkdown(md)` splits it into **blocks** (what the
display groups by) made of **parts** (verbatim strings, or a reference to a **unit**). A unit is one line's
prose with every protected span replaced by a numbered placeholder `⟦0⟧`, `⟦1⟧`, …

```ts
export type BlockKind = 'prose' | 'heading' | 'list' | 'quote' | 'table' | 'code' | 'blank' | 'rule' | 'html'
export type Part = string | { unit: number }
export type Block = { kind: BlockKind; original: string; parts: Part[] }
export type Unit = { text: string; spans: string[] }   // text holds ⟦i⟧ for spans[i]
export type Plan = { blocks: Block[]; units: Unit[] }

export function planMarkdown(md: string): Plan
export function unmask(unit: Unit): string                       // the unit's original text
export function restoreUnit(unit: Unit, translated: string): string | null
export function buildBlock(plan: Plan, block: Block, out: readonly (string | null)[]): string | null
export function buildDocument(plan: Plan, out: readonly (string | null)[]): string
```

**Round trip invariant** (the main test): for any input,
`buildDocument(plan, plan.units.map(unmask)) === md` and the blocks' `original`s joined with `'\n'` equal `md`.

### Block rules (line based, in this order)

| Line | Block | Sent to the translator |
| --- | --- | --- |
| Fenced code: ```` ``` ```` / `~~~` (≥3, may sit after list indent or `>` markers) through its closing fence (same char, run ≥ opening; unclosed = to end) | `code` | nothing |
| Indented code: ≥4 spaces or a tab, after a blank line or document start, not inside a list | `code` | nothing |
| Blank | `blank` | nothing |
| Thematic break `---` `***` `___` | `rule` | nothing |
| A line that is only an HTML tag or comment | `html` | nothing |
| Table: a header row with `\|`, then a delimiter row (`\| --- \| :-: \|`), then rows with `\|` | `table` | each non-empty cell's text (delimiter row and pipes kept) |
| `#`–`######` heading | `heading` | text after the marker (closing `#`s kept) |
| `>` quote markers (nested) | `quote` | the rest of the line, which is classified again (list/heading inside a quote keep their marker too) |
| List item `-` `*` `+` `1.` `1)` with optional task box `[ ]` `[x]` | `list` | text after marker and box |
| Continuation lines of a list item (indented) | same `list` block | the text after the indent |
| Anything else | `prose` | the line after its leading whitespace |

Consecutive lines of the same kind form one block (a list with its items, a paragraph's lines, a table).
Each line is its own unit; line breaks are never moved. A line whose unit would hold no letter outside
placeholders (`\p{L}`) is kept verbatim (no unit). Trailing whitespace and a hard-break `  ` stay outside
the unit.

### Protected inline spans (masked as `⟦i⟧`, in this priority)

1. Inline code: a backtick run and its matching run of the same length.
2. Images `![alt](url)` whole.
3. Link destinations: in `[text](url "title")` the `](url "title")` part; in `[text][ref]` the `][ref]`.
   The link text stays translatable. Reference definitions `[ref]: url` are kept verbatim as a line.
4. Autolinks `<https://…>`, bare URLs `https?://…` (trailing `.,;:!?)` not included unless balanced).
5. Inline HTML tags `<br>`, `<kbd>`, `</kbd>`.
6. Emails.
7. Paths: `~/…`, `./…`, `../…`, `/a/b`, `a/b/c.ts`, with an optional `:line[:col]`; bare file names with
   a known extension (`index.ts`, `package.json`, `README.md:12`).
8. Command-line flags `--flag`, `--flag=value`.
9. Identifiers: calls `name()` / `obj.method()`, dotted members `a.b.c` whose parts are each ≥2 chars
   (before the case rules, so `Promise.allSettled` is one span), `snake_case`, `SCREAMING_CASE` (2+ parts),
   `camelCase`, `$ENV_VAR`, `${…}`. A lone `.`, `..` or `~` is a path only with a `/` after it, so a
   sentence's period is never masked.
10. Emphasis markers (`**`, `__`, `*`, `_`, `~~`) are NOT masked: the translator moves them with the words.

`restoreUnit` accepts `⟦ 0 ⟧` spacing variants, requires each `⟦i⟧` (i < spans.length) exactly once and
no other `⟦n⟧`, and answers `null` otherwise. The restored text uses the original span bytes, so an engine
that changes code inside a span cannot change it.

### Language detection (`src/detect.ts`)

```ts
export type Script = 'Latin' | 'Hangul' | 'Japanese' | 'Han' | 'Cyrillic' | 'Greek' | 'Arabic' | 'Hebrew' | 'Thai' | 'Devanagari'
export function scriptOf(lang: string): Script            // 'ko' → Hangul, 'ja' → Japanese, 'zh*' → Han, …, else Latin
export function scriptShare(text: string, script: Script): number
```

`scriptShare` counts letters (`\p{L}`) outside fenced code, inline code, URLs and paths, and answers the share
in `script` (0 when there are no letters). `Japanese` counts kana and Han but needs at least one kana.

- A prompt is translated when its share in the person's script is ≥ 0.2. For a Latin-script language the
  share cannot tell (`es` vs `en`), so the extension asks the translation model whether the text is
  English (`isEnglish` in `src/engines.ts`, cached per text).
- A reply block is skipped when its share in the person's script is > 0.3 (already in their language).

## 2. Engines (`src/engines.ts`)

Host access goes through one small interface, so the engines carry no Pi types:

```ts
export type Io = {
  complete(req: { model: string; system: string; prompt: string; maxTokens: number; timeoutMs: number }): Promise<{ ok: true; text: string } | { ok: false; reason: string }>
  fetch(url: string, init: { method: string; headers: Record<string, string>; body: string }): Promise<{ status: number; ok: boolean; text: string }>
  run(argv: string[], stdin: string, timeoutMs: number): Promise<{ exitCode: number; stdout: string; stderr: string }>
}
export function translateUnits(io: Io, cfg: EngineConfig, units: Unit[], from: string, to: string): Promise<Translated>
// Translated = { out: (string | null)[]; engine: string; error?: string }
```

| Engine | Transport | Batch | Code protection |
| --- | --- | --- | --- |
| `model` (default, no key) | `ctx.modelRegistry.complete` with the model from `model`, else an available Haiku model (the session's provider first), else the session's model | ≤ 40 units / 6,000 chars | placeholders + system rule "copy ⟦n⟧ exactly" |
| `openai` (Ollama, LM Studio, DeepSeek, any OpenAI-compatible) | `fetch` `POST {baseUrl}/chat/completions` | same | same |
| `command` (Apple Translation CLI, DeepL script, anything) | `child_process.spawn`, stdin `{"from","to","lines":[…]}`, stdout `{"lines":[…]}` | all units at once | placeholders |

Each call has a 30 s deadline. The LLM protocol: user message is a JSON array of strings, reply must be a
JSON array of the same length. A reply that does not parse or has a different length is retried once as two
halves, then each unit in that batch is `null`. A unit whose placeholders do not come back
(`restoreUnit` → `null`) is `null`. External engine failure falls back to `model` unless `fallback` is off.

Results are cached per session in memory keyed by `from>to|unit text`, so a repeated line (a re-rendered
block, a repeated heading) is never sent twice. A prompt with failed lines is tried once more; only the
failed lines go out again.

## 3. Display

Everything is drawn through one Markdown transformer (`pi.registerMarkdownTransformer`, message types
`user` and `assistant`). Pi calls it whenever a message is drawn: new, streaming, restored, or at a new
width. It is synchronous, so it only reads what the background work has stored; after new results the
extension calls `tui.invalidate()` and `tui.requestRender()` so every message is drawn again. The `tui`
comes from an always-mounted widget above the editor, which is also where the preview line lives.

The indented and column views are Markdown built from already drawn lines: each translation is rendered
with pi-tui's `Markdown` at the width it gets and tinted, then the lines are escaped so Pi's Markdown
renderer prints them as they are (`literalLines` in `src/views.ts`: punctuation escaped except `(`, `)`
and `[`, which with `\` would open LaTeX math, leading spaces as no-break spaces, lines joined by hard
breaks, ANSI color codes kept).

### Replies

Translations are keyed by an FNV-1a hash of the text block (`keyOf`). Blocks already in the person's
language are drawn untouched.

`defaultView` option (also `/translate view <mode>`):

| Mode | What is drawn | Code blocks |
| --- | --- | --- |
| `auto` (default) | `side` when the message area is ≥ 140 columns, else `stacked` | — |
| `stacked` | each block as the model wrote it; right under it the translation rendered as Markdown (lists, tables, inline code) in the theme's `dim` color, 2 columns in and 4 short of the right edge | drawn once, untranslated |
| `interleave` | each prose/heading/list/quote/table block in English, then its translation right under it as a quote | drawn once, untranslated |
| `side` | one row per block: English left, translation right, aligned block by block (needs ≥ 100 columns, else `stacked`) | drawn once at full width |
| `below` | the English reply, then the whole translation as a quote | in the English only |
| `translated` | the translated document only, reads like a native reply | in place, untranslated |
| `original` | English only (translation off for display) | — |

States, drawn quietly at the end of the block:

- pending: `⋯ translating…` dim
- failed: `translation failed: <reason>` in the error color; units that failed alone fall back to English inline
- fallback engine: `· model` dim, only when the engine differs from the configured one

Reply translation runs off the turn: a text block is queued as soon as it ends (`message_update` with
`text_end`), while the same reply may still stream a tool call, and `message_end` queues any block not
queued yet. A 250 ms timer started at `session_start` (interactive mode only) drains the queue, at most 3
in flight, newest first, since the newest is the one on screen. A finished translation is saved with
`pi.appendEntry('pi-trans', …)`, which stays out of the model's context, and read back at `session_start`,
so a resumed session draws it without asking again. Then the last 10 untranslated replies of the branch are queued.

A counter bumped by `session_start` and `session_shutdown` drops results of work started for a session that
is gone.

### Prompts

- **Live preview** (`preview` option, default on): the timer reads the editor text; 700 ms after it stops
  changing, the line above the editor shows `EN ▸ <translation>`. The result is cached under the draft, so
  **Enter uses the preview and adds no latency**.
- **Submit**: the `input` event returns `{ action: 'transform', text: english }`. On failure the original is
  sent and a notice says why. Slash commands, `!` shell commands, text under 2 characters and input from
  other extensions pass through. This runs in every mode (print and RPC too).
- **Transcript row**: the person's own text as typed, and under it the English the model read, dim, as
  plain text prefixed `↳`. The pair is saved with `pi.appendEntry`, keyed by the English, so a resumed
  session shows it too.

### Status

The extension's own words (command results, status, pending and failure notes) are English, like Pi's own
interface, whatever the person's language: only translations are in their language.

- Footer status (`ctx.ui.setStatus`): `ko↔en · claude-haiku-4-5` (and `· 3 queued` while there is work).
- `/translate` toggles on and off; `/translate on|off|status|view <mode>`, with completions. Both last
  until Pi restarts or `/reload`.
- `/translate:settings` opens a `SettingsList` panel (`src/settings.ts`) over the options file: toggles
  cycle on Enter, choices and text open a submenu, the model choice lists
  `ctx.modelRegistry.getAvailable()` with type-to-search. Each change is written at once (other keys
  kept, empty text removes the key) and applied to the running config; `language` applies next session.

## 4. Configuration (`~/.pi/agent/pi-trans.json`)

Read at `session_start`, so `/reload` applies a change made by hand. `/translate:settings` writes it.

| Field | Default | Notes |
| --- | --- | --- |
| `language` | empty | the person's language; empty follows `LC_ALL`/`LC_MESSAGES`/`LANG`; nothing set means English, nothing translated |
| `engine` | `model` | `model` · `openai` · `command` |
| `defaultOn` | `true` | translation on at the first session of a Pi process |
| `defaultView` | `auto` | `auto` · `stacked` · `side` · `interleave` · `below` · `translated` · `original`; an older `view` key is read when it is missing |
| `preview` | `true` | live preview line |
| `model` | empty | model for the model engine and fallback, `provider/id` or an id |
| `openaiBaseUrl`, `openaiModel`, `openaiApiKey` | empty | OpenAI-compatible endpoint |
| `command` | empty | command line for the command engine (split into argv, quotes honoured), JSON over stdin/stdout |
| `fallback` | `true` | fall back to the model engine when the external engine fails |
