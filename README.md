# cc-trans

**Talk to Claude Code in your own language. Claude still works in English.**

You type in Korean, Japanese, Chinese, Spanish… and Claude receives clean English. Claude answers
in English, and each paragraph gets a quiet translation right under it. Code is never touched.

![A Korean prompt reaches Claude in English; Claude fixes the file, and its English answers get a muted Korean translation under each paragraph, then the same transcript side by side and translated only](demo/cc-trans.gif)

```
/plugin install cc-trans --marketplace midagedev/cc-trans
```

## Why

- **Think in your language, keep the session in English.** Claude only ever reads English, so its
  answers, and what it writes into your repo (comments, commit messages, docs), come out in English
  like the rest of your code.
- **Read the original, glance at the translation.** The English stays the main text, so you keep
  the exact wording and the technical terms; the translation sits under it, muted, for when you need it.
- **No waiting.** The English for your prompt is ready before you press Enter, and replies are
  translated in the background, never holding Claude up.

## What you get

**A live English preview while you type.** A band above the prompt shows what Claude will read
(`EN ▸ …`). Enter sends exactly that, with no extra round trip. The transcript keeps what you typed,
with the English under it:

```
> users.js의 loadUsers가 왜 느린지 한 문장으로 말하고 바로 고쳐줘
  ↳ In one sentence, tell me why users.js's loadUsers is slow, then fix it right away
```

**Translations that know what code is.** Code blocks, `inline code`, paths, URLs, flags, `snake_case`,
`camelCase` and `dotted.members` never go to the translator: they are swapped for placeholders and
put back byte for byte. Headings, lists, quotes and tables keep their shape line for line.

**Pick how replies look.** `/translate view <mode>` redraws the whole transcript:

| View | What you see |
| --- | --- |
| `stacked` | each paragraph as Claude wrote it, its translation right under it, indented and muted |
| `side` | English left, translation right, block by block |
| `translated` | the translation only, code in place |
| `interleave` | each paragraph, then its translation as a quote |
| `below` | the English reply, then the whole translation |
| `original` | English only |
| `auto` (default) | `side` on a terminal 140+ columns wide, else `stacked` |

**Any language, any translator.** By default the translation runs on Claude Haiku through your own
Claude Code session: nothing to set up. Prefer something else? Point it at any OpenAI-compatible
server (Ollama, LM Studio, DeepSeek, OpenRouter) or at your own program (Apple Translation, DeepL,
Papago).

## Use it

| Command | |
| --- | --- |
| `/translate` | turn translation on or off |
| `/translate view <mode>` | change how replies are shown |
| `/translate status` | language, engine, view and queue |

The hint under the prompt shows what is running, e.g. `ko↔en · haiku · 2 queued`.

## Your language

cc-trans picks your language from, in order: its `language` option, Claude Code's `language`
setting, then your system locale (`LANG`). A code (`ko`, `ja`, `zh`, `es`) or a name (`Korean`,
`日本語`) both work. With nothing set (or English), it stays out of the way.

> **Tip:** Claude Code's own `language` setting also asks Claude to *answer* in that language, which
> leaves nothing to translate. To get English answers with translations, leave that setting empty
> and set cc-trans's `language` option instead.

## Engines

| Engine | Setup | Notes |
| --- | --- | --- |
| `haiku` (default) | none | Uses your Claude Code session's model access |
| `openai` | `openaiBaseUrl`, `openaiModel`, optional `openaiApiKey` | Any OpenAI-compatible server: Ollama, LM Studio, DeepSeek, OpenRouter… |
| `command` | `command` | Your own program: `{"from","to","lines":[…]}` on stdin, `{"lines":[…]}` on stdout |

When `openai` or `command` fails, `haiku` translates instead (unless `fallback` is off).

## Options

Set at install time, or under `pluginConfigs["cc-trans"].options` in settings.

| Option | Default | |
| --- | --- | --- |
| `language` | empty | your language; empty follows Claude Code's `language` setting, then the system locale |
| `engine` | `haiku` | `haiku` · `openai` · `command` |
| `view` | `auto` | see the views above |
| `preview` | `true` | live English preview while typing |
| `haikuModel` | `haiku` | model for the haiku engine |
| `openaiBaseUrl` · `openaiModel` · `openaiApiKey` | | for the openai engine |
| `command` | | for the command engine |
| `fallback` | `true` | fall back to haiku |

## FAQ

**Does my code go to the translator?** No. Only prose is sent: code blocks are skipped, and inline
code, paths, URLs and identifiers are replaced with placeholders before anything leaves.

**What does it cost?** With the default engine, translations are Haiku calls on your Claude
account: short prose only, and each line is cached for the session, so a line is never translated
twice. With `openai` (a local Ollama, say) or `command`, it costs whatever that engine costs.

**What if a translation fails?** Your prompt is sent as you typed it and a toast says why; a reply
block keeps its English and says the translation failed. Nothing is ever blocked.

## Development

```
claude --plugin-dir .          # load it
claude plugin validate .
claude plugin test .
vhs demo/demo.tape && demo/render.sh   # re-record the demo (needs vhs, ffmpeg, gifsicle)
```

See [DESIGN.md](DESIGN.md) for the unit model and the display rules.

## License

MIT
