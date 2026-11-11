# Porting upstream cc-trans into pi-trans

This repository is pi-trans, the Pi extension port of [cc-trans](https://github.com/midagedev/cc-trans),
a Claude Code mod. Upstream keeps evolving; this file tells an agent how to bring its changes over.

**Upstream base: `f9f0fa7`** (the last upstream commit whose changes are in this tree). Update this line
in the same change that ports newer commits.

Upstream code and docs say `cc-trans`; here the name is `pi-trans` (`NAME` in `src/index.ts`: options
file `~/.pi/agent/pi-trans.json`, footer status key, widget key, `customType` of saved session entries).
Write `pi-trans` wherever ported code or text names the extension, and keep `cc-trans` only for upstream
itself (its repository, remote and files).

## Workflow

1. Fetch upstream and list what is new:

   ```
   git remote get-url upstream >/dev/null 2>&1 || git remote add upstream https://github.com/midagedev/cc-trans.git
   git fetch upstream
   git log --oneline --reverse f9f0fa7..upstream/main                   # use the base above
   git diff --stat f9f0fa7 upstream/main
   ```

2. Never `git merge` or `git cherry-pick` upstream: the layouts differ, and a merge brings back
   `hooks/`, `.claude-plugin/` and `types/`. Port each change by hand, commit by commit or as one
   change, using the file map below.
3. Classify every upstream commit before porting it:
   - **Pure logic** (`hooks/markdown.ts`, `hooks/detect.ts`): apply as is (see below).
   - **Shared logic with Pi changes** (`hooks/engines.ts`, `hooks/language.ts`, `hooks/strings.ts`,
     the pure helpers in `hooks/register.tsx`): port the change, keep the Pi deltas listed below.
   - **Host behavior** (events, rendering, commands, options in `hooks/register.tsx`,
     `.claude-plugin/plugin.json`): reimplement with the Pi API map below, or skip it when Pi has no
     equivalent, and say so in the final report.
   - **Claude Code only** (marketplace, `pluginConfigs`, Claude Code settings, `claude-code/testing`
     quirks): skip.
   - **Docs**: port the meaning into `README.md`, the three translated READMEs and `DESIGN.md`, in Pi terms.
4. Port tests with the code (test files are in the File map), run the Checks, then move the base line above to the last
   ported upstream commit.
5. Report which upstream commits were ported, adapted, or skipped and why.

For the two identical files a patch applies directly:

```
git diff f9f0fa7 upstream/main -- hooks/markdown.ts hooks/detect.ts | git apply -p2 --directory=src
```

If upstream adds a relative import, give it a `.ts` extension (`./markdown.ts`): Node type stripping and
Pi's loader both need it.

## File map

| Upstream | Here | Differences to keep |
| --- | --- | --- |
| `hooks/markdown.ts` | `src/markdown.ts` | none |
| `hooks/detect.ts` | `src/detect.ts` | none |
| `hooks/language.ts` | `src/language.ts` | `pickLanguage(option, locales)`: no Claude Code `language` setting, so no `setting` argument and no `'setting'` source |
| `hooks/strings.ts` | `src/strings.ts` | no `languageSetting` / `from_setting`; adds `missingModel`; header says Pi |
| `hooks/engines.ts` | `src/engines.ts` | engine `haiku` is `model` (`EngineConfig.model`, `modelRaw`, fallback labelled `model`, fallback error without a `haiku:` prefix); `cfg.model` is passed as is, empty included (never default it to `'haiku'`: `resolveModel()` matches ids like `claude-haiku-4-5`, not `haiku`); adds `isEnglish()`; `.ts` import |
| `hooks/register.tsx`, pure helpers (`hash`, `keyOf`, `quote`, `interleave`, `plainText`, `plainLines`, `stackedBlocks`, `foldedTranslation`) | `src/views.ts` | same code; `keyOf` and `quote` are exported |
| `hooks/register.tsx`, JSX views (stacked, side, below, notes) | `src/views.ts` (`stackedView`, `sideView`, `belowView`, `translationLines`, `noteLines`, `literalLine`, `literalLines`) | drawn as lines (rendered by pi-tui's `Markdown`, or wrapped here for notes) turned into literal Markdown, since Pi only lets an extension rewrite a message's Markdown |
| `hooks/register.tsx`, everything else | `src/index.ts` | see the API map and Pi deltas below |
| `hooks/hooks.json` | `package.json` `pi.extensions` | |
| `types/index.d.ts` | `src/types.ts` | also holds `VIEWS` (from `hooks/register.tsx`); adds `Saved` (session entries) |
| `.claude-plugin/plugin.json` `userConfig` | `readConfig()` in `src/index.ts`, options file `~/.pi/agent/pi-trans.json` | `haikuModel` is `model` (`provider/id` or id, default empty); `engine` default `model`; the resolved language is kept outside `Config`, the option as `languageOption` |
| `tsconfig.json` (extends the Claude Code types) | `tsconfig.json` | standalone; `allowImportingTsExtensions` |
| `tests/markdown.test.ts` | `tests/markdown.test.ts` | imports `./expect.ts` and `../src/*.ts` |
| `tests/mod.test.tsx` | `tests/units.test.ts` (engines, helpers, language), `tests/extension.test.ts` (whole extension against a stand-in Pi) | |
| `DESIGN.md`, `README*.md` | same files | written for Pi |
| `demo/` | `demo/` | tape starts `pi --no-extensions -e`; no `settings.json`; GIF must be recorded with Pi |

## Claude Code API → Pi API

| Upstream (`$`, `on(...)`) | Here |
| --- | --- |
| module-level state, `atom(...)` | closure variables in `piTrans(pi)`; per-session state reset in `stop()` at `session_start` / `session_shutdown`, guarded by `generation` |
| `on('session.start')` | `pi.on('session_start')`: reads options, language, saved entries; in `tui` mode mounts the widget and starts the timer |
| `$.clock.every(250)`, `$.clock.now()` | `setInterval(tick, TICK_MS)` started in `session_start` (never in the factory), `Date.now()` |
| `on('prompt.submit')` + `next({ ...e, text })` | `pi.on('input')` returning `{ action: 'transform', text }` or `{ action: 'continue' }`; skip `source === 'extension'` |
| `prompt.edit` / `prompt.change` | the tick polls `ctx.ui.getEditorText()` |
| `session.append` (response) | `pi.on('message_end')` (assistant text blocks) |
| `ui.render` `AssistantMessage` while `busy`, `watched`, `STABLE_MS`, `drainStable` (a block unchanged for 800 ms is done) | `pi.on('message_update')` with `assistantMessageEvent.type === 'text_end'`: Pi reports the end of each text block, so the block is queued then, while the same reply may still stream a tool call |
| `turn.complete` → `enqueueTurn`, render-time `wanted` / `drainWanted` (replies missed or left pending) | `enqueueRecent(ctx)`: the last `RESUME_REPLIES` (10) untranslated replies of `ctx.sessionManager.getBranch()`, at `session_start` and `/translate on` |
| `$.state` persistence | `pi.appendEntry(NAME, Saved)` for finished replies and translated prompts only, read back from `ctx.sessionManager.getEntries()` |
| `ui.render` `AssistantMessage` / `UserMessage` | one `pi.registerMarkdownTransformer` for `user` and `assistant`; synchronous, so it only reads stored results |
| redraw after a translation lands | `tui.invalidate()` + `tui.requestRender()` (`flush()`), `tui` from the widget factory |
| `ui.render` `AssistantMessage` props `isSummary`, `isFirstOfReply` (`bulleted`) | none: Pi draws the message frame, and summaries are another message type |
| `ui.render` `AbovePrompt` | `ctx.ui.setWidget(NAME, factory, { placement: 'aboveEditor' })` (`previewLine`) |
| `ui.render` `PromptHint` tail, `$.ui.status` | `ctx.ui.setStatus(NAME, …)`: one footer slot for both, so after the transient `translatingPrompt` status call `updateStatus()`, never `setStatus(NAME, undefined)` |
| `$.ui.toast` | `ctx.ui.notify(text, 'warning')` |
| `on('command.run', { command: 'translate' })` returning `{ text }`, `$.command.register` | `pi.registerCommand('translate', { handler, getArgumentCompletions })`, output via `ctx.ui.notify(text, 'info')` |
| `$.model.complete` | `Io.complete` → `ctx.modelRegistry.complete(model, …)`, model from `resolveModel()` |
| `$.model.classify(text, ['english','other'])` | `isEnglish()` in `src/engines.ts`; `undefined` (no answer) means do not translate and is not cached |
| `$.http.fetch` | global `fetch` with a 30 s timeout (`ioFor`) |
| `$.process.run` | `child_process.spawn` with stdin (`ioFor`) |
| `$.env.get('LANG')` | `process.env` |
| `$.settings.read()` (`language`) | no equivalent |
| `onScreen` visibility | no equivalent: the queue runs newest first |
| `e.isMeta`, `origin` checks | `event.source` |

## Pi deltas in `src/index.ts`

Keep these when porting upstream changes to the same code:

- `needsTranslation` also passes `!` lines through (Pi shell commands).
- `engineLabel()` is computed on each call: the resolved model id (`claude-haiku-4-5`), the openai model,
  or `command`. Upstream computed a label once at registration.
- `SIDE_MIN_WIDTH` (100) names the width below which `side` falls back to `stacked`.
- In `stacked` and `side` the translation is rendered as Markdown (`translationLines`: pi-tui's
  `Markdown`, tables included) and tinted with the theme's `dim` color, which Pi generates at the same
  faint level as Claude Code's `subtle`. Upstream drew it as plain text (`plainLines`, inline marks taken
  out); `plainText` and `plainLines` stay for parity and for the note under prompts.

## Upstream features not ported

Keep this list current. Port one when Pi gains a way to do it, or when asked.

- Visible-first queue (`onScreen`): newest first instead. Pi tells an extension nothing about what is on
  screen: the Markdown transform context has no such field, fullscreen mode renders the whole transcript
  and then slices it (`ScrollView.render` in `pi-tui`), and regular mode leaves scrolled-off lines to the
  terminal. Mapping `viewportTop` to messages would depend on Pi internals.
- Queuing any older reply as it is drawn (`wanted`): only the last 10 at session start or `/translate on`.
  Every message is drawn, on screen or not, for the same reason.
- Following Claude Code's `language` setting, and the `/translate status` note about it.

## Pi constraints

- Pi renders user messages with backslash escapes kept, so text drawn under a prompt goes through
  `literalLines(lines, false)`; assistant views escape punctuation (`literalLines(lines)`).
- Pi's Markdown reads `\(…\)` and `\[…\]` as LaTeX math, so `literalLine` leaves `(`, `)` and `[` bare
  and escapes `]`, which is enough to stop links and footnotes.
- The Markdown transformer runs on every redraw and width change: keep it cheap and side effect free.
- Host packages (`@earendil-works/pi-*`) are `peerDependencies`, never `dependencies`.
- The extension's own UI words stay English (`src/strings.ts`); only translations are in the person's language.

## Checks

```
npm test            # node --test tests/*.test.ts
npm run check       # tsc --noEmit
pi -e .             # interactive smoke test: preview line, ↳ line under the prompt, reply translation, footer
LANG=ko_KR.UTF-8 pi -ne -e . --no-session -p '이 문장을 그대로 따옴표 안에 인용해줘'   # the model should quote English
```
