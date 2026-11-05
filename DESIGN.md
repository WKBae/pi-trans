# cc-trans — design

A Claude Code mod that lets a person write and read in their own language while Claude works in English.
Prompts typed in the person's language are sent to Claude in English; Claude's English replies are shown
with a translation. Code, paths, commands and Markdown structure never go through the translator.

## 1. Translation unit model (`hooks/markdown.ts`)

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
   a known extension (`register.tsx`, `plugin.json`, `README.md:12`).
8. Command-line flags `--flag`, `--flag=value`.
9. Identifiers: calls `name()` / `obj.method()`, dotted members `a.b.c` whose parts are each ≥2 chars
   (before the case rules, so `Promise.allSettled` is one span), `snake_case`, `SCREAMING_CASE` (2+ parts),
   `camelCase`, `$ENV_VAR`, `${…}`. A lone `.`, `..` or `~` is a path only with a `/` after it, so a
   sentence's period is never masked.
10. Emphasis markers (`**`, `__`, `*`, `_`, `~~`) are NOT masked: the translator moves them with the words.

`restoreUnit` accepts `⟦ 0 ⟧` spacing variants, requires each `⟦i⟧` (i < spans.length) exactly once and
no other `⟦n⟧`, and answers `null` otherwise. The restored text uses the original span bytes, so an engine
that changes code inside a span cannot change it.

### Language detection (`hooks/detect.ts`)

```ts
export type Script = 'Latin' | 'Hangul' | 'Japanese' | 'Han' | 'Cyrillic' | 'Greek' | 'Arabic' | 'Hebrew' | 'Thai' | 'Devanagari'
export function scriptOf(lang: string): Script            // 'ko' → Hangul, 'ja' → Japanese, 'zh*' → Han, …, else Latin
export function scriptShare(text: string, script: Script): number
```

`scriptShare` counts letters (`\p{L}`) outside fenced code, inline code, URLs and paths, and answers the share
in `script` (0 when there are no letters). `Japanese` counts kana and Han but needs at least one kana.

- A prompt is translated when its share in the person's script is ≥ 0.2. For a Latin-script language the
  share cannot tell (`es` vs `en`), so the mod asks `$.model.classify(text, ['english', 'other'])`.
- A reply block is skipped when its share in the person's script is > 0.3 (already in their language).

## 2. Engines (`hooks/engines.ts`)

One interface; units go in, strings come out in the same order, `null` for a unit that failed.

```ts
type Engine = (units: string[], from: string, to: string, signal) => Promise<{ out: (string | null)[]; engine: string } | { error: string }>
```

| Engine | Transport | Batch | Code protection |
| --- | --- | --- | --- |
| `haiku` (default, no key) | `$.model.complete`, system prompt cached | ≤ 60 units / 8,000 chars | placeholders + system rule "copy ⟦n⟧ exactly" |
| `openai` (Ollama, LM Studio, DeepSeek, any OpenAI-compatible) | `$.http.fetch` `POST {baseUrl}/chat/completions` | same | same |
| `command` (Apple Translation CLI, DeepL script, anything) | `$.process.run`, stdin `{"from","to","lines":[…]}`, stdout `{"lines":[…]}` | ≤ 100 lines | placeholders |

The LLM protocol: user message is a JSON array of strings, reply must be a JSON array of the same length.
A reply that does not parse or has a different length is retried once as two halves, then each unit
in that batch is `null`. A unit whose placeholders do not come back (`restoreUnit` → `null`) is `null`.
External engine failure falls back to `haiku` unless `fallback` is off.

Results are cached per session in `$.state` keyed by FNV-1a of `engine|from|to|unit.text`, so a repeated
line (a re-rendered block, a repeated heading) is never sent twice.

## 3. Display

### Replies — `ui.render` on `AssistantMessage`

Translations are keyed by the transcript row id (`session.append` uuid ↔ render `requestId`), with a hash of
the block text as the fallback key. Summary blocks (`isSummary`) and blocks already in the person's language
are drawn by the engine untouched.

`view` option (also `/translate view <mode>`):

| Mode | What is drawn | Code blocks |
| --- | --- | --- |
| `auto` (default) | `side` when the transcript is ≥ 140 columns, else `stacked` | — |
| `stacked` | each block as Claude wrote it; right under it the translation as plain text (inline marks taken out) in the theme's `subtle` color, 2 columns in and 4 short of the right edge; a list item keeps its hanging indent | drawn once, untranslated |
| `interleave` | each prose/heading/list/quote/table block in English, then its translation right under it in the accent color behind a `▎` gutter | drawn once, untranslated |
| `side` | one row per block: English left, translation right, aligned block by block | drawn once at full width |
| `translated` | the translated document only, reads like a native reply; English is one keypress away (`/translate view`) | in place, untranslated |
| `original` | English only (translation off for display) | — |

States, drawn quietly at the end of the block:

- pending: `· 번역 중…` dim, only after 300 ms (no flicker for cache hits)
- failed: `· 번역 실패: <reason>` dim red; units that failed alone fall back to English inline
- fallback engine: `· haiku` dim, only when the engine differs from the configured one

Reply translation runs off the turn: `session.append` (door `response`, main thread, text blocks) records a
job in `$.state`; a `$.clock.every(250)` worker started at `session.start` drains it, at most 3 in flight,
**blocks that are on screen first** (`onScreen` from render). The queue lives in `$.state`, so a reload
re-drains it instead of leaving blocks at "번역 중…".

### Prompts

- **Live preview** (`preview` option, default on): `prompt.edit` → 700 ms after typing stops, a band above
  the prompt (`AbovePrompt`) shows `EN ▸ <translation>` dim. The result is cached under the draft's hash, so
  **Enter uses the preview and adds no latency**.
- **Submit**: `prompt.submit` → `next({ ...e, text: english })`, with a 15 s deadline. On failure the original is
  sent and a toast says why. Slash commands, `isMeta` prompts and non-person origins pass through.
- **Transcript row** (`UserMessage`, origin prompt): the person's own text as typed, and under it the English
  Claude read, dim, prefixed `↳`, in the normal view and in ctrl+o alike (the engine marks a prompt row
  `isExpanded` in both).

### Status and settings

- `PromptHint.tail`: `ko↔en · haiku` (and `· 3 queued` while the worker has work).
- `/translate` with no argument opens a small settings pane (engine, language, view, preview, on/off);
  `/translate on|off|status|view <mode>`.
- `/translate status` also warns when the Claude Code `language` setting makes Claude answer in the person's
  language already (nothing for the mod to translate then).

## 4. Configuration (`userConfig`)

| Field | Default | Notes |
| --- | --- | --- |
| `language` | empty | the person's language; empty follows Claude Code's `language` setting, then `LC_ALL`/`LC_MESSAGES`/`LANG`; nothing set means English, nothing translated |
| `engine` | `haiku` | `haiku` · `openai` · `command` |
| `view` | `auto` | `auto` · `interleave` · `side` · `translated` · `original` |
| `preview` | `true` | live preview band |
| `haikuModel` | `haiku` | model for the haiku engine and fallback |
| `openaiBaseUrl`, `openaiModel`, `openaiApiKey` (sensitive) | empty | OpenAI-compatible endpoint |
| `command` | empty | argv for the command engine, JSON over stdin/stdout |
| `fallback` | `true` | fall back to haiku when the external engine fails |
