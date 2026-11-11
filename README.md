# pi-trans

**English** · [한국어](README.ko.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md)

**Talk to Pi in your own language. The agent still works in English.**

You type in Korean, Japanese, Chinese, Spanish… and the model receives clean English. It answers
in English, and each paragraph gets a quiet translation right under it. Code is never touched.

```
pi install npm:@wkbae/pi-trans
```

## Why

- **Think in your language, keep the session in English.** The model only ever reads English, so
  its answers, and what it writes into your repo (comments, commit messages, docs), come out in
  English like the rest of your code.
- **Read the original, glance at the translation.** The English stays the main text, so you keep
  the exact wording and the technical terms; the translation sits under it, muted, for when you need it.
- **No waiting.** The English for your prompt is ready before you press Enter, and replies are
  translated in the background, never holding the agent up.

## What you get

**A live English preview while you type.** A line above the editor shows what the model will read
(`EN ▸ …`). Enter sends exactly that, with no extra round trip. The transcript keeps what you typed,
with the English under it:

```
users.js의 loadUsers가 왜 느린지 한 문장으로 말하고 바로 고쳐줘

  ↳ In one sentence, tell me why users.js's loadUsers is slow, then fix it right away
```

**Translations that know what code is.** Code blocks, `inline code`, paths, URLs, flags, `snake_case`,
`camelCase` and `dotted.members` never go to the translator: they are swapped for placeholders and
put back byte for byte. Headings, lists, quotes and tables keep their shape line for line.

**Pick how replies look.** `/translate view <mode>` redraws the whole transcript:

| View | What you see |
| --- | --- |
| `stacked` | each paragraph as the model wrote it, its translation right under it, indented and muted |
| `side` | English left, translation right, block by block |
| `translated` | the translation only, code in place |
| `interleave` | each paragraph, then its translation as a quote |
| `below` | the English reply, then the whole translation |
| `original` | English only |
| `auto` (default) | `side` on a terminal 140+ columns wide, else `stacked` |

**Any language, any translator.** By default the translation runs on a small model from the
providers you already signed in to in Pi (a Haiku model when there is one): nothing to set up.
Prefer something else? Point it at any OpenAI-compatible server (Ollama, LM Studio, DeepSeek,
OpenRouter) or at your own program (Apple Translation, DeepL, Papago).

## Use it

| Command | |
| --- | --- |
| `/translate` | turn translation on or off |
| `/translate view <mode>` | change how replies are shown |
| `/translate status` | language, engine, view and queue |
| `/translate:settings` | change the options below |

The footer shows what is running, e.g. `ko↔en · claude-haiku-4-5 · 2 queued`.

## Your language

pi-trans picks your language from its `language` option, then your system locale (`LC_ALL`,
`LC_MESSAGES`, `LANG`). A code (`ko`, `ja`, `zh`, `es`) or a name (`Korean`, `日本語`) both work.
With nothing set (or English), it stays out of the way.

## Engines

| Engine | Setup | Notes |
| --- | --- | --- |
| `model` (default) | none | A model from your Pi providers; `model` picks one |
| `openai` | `openaiBaseUrl`, `openaiModel`, optional `openaiApiKey` | Any OpenAI-compatible server: Ollama, LM Studio, DeepSeek, OpenRouter… |
| `command` | `command` | Your own program: `{"from","to","lines":[…]}` on stdin, `{"lines":[…]}` on stdout |

When `openai` or `command` fails, `model` translates instead (unless `fallback` is off).

## Options

Change them with `/translate:settings`, or put them in `~/.pi/agent/pi-trans.json` and `/reload`:

```json
{ "language": "ko", "defaultView": "stacked" }
```

| Option | Default | |
| --- | --- | --- |
| `language` | empty | your language; empty follows the system locale |
| `engine` | `model` | `model` · `openai` · `command` |
| `defaultOn` | `true` | translation is on when Pi starts |
| `defaultView` | `auto` | see the views above |
| `preview` | `true` | live English preview while typing |
| `model` | empty | model for the model engine, `provider/id` or an id; empty picks a Haiku model, else the session's model |
| `openaiBaseUrl` · `openaiModel` · `openaiApiKey` | | for the openai engine |
| `command` | | for the command engine |
| `fallback` | `true` | fall back to the model engine |

## FAQ

**Does my code go to the translator?** No. Only prose is sent: code blocks are skipped, and inline
code, paths, URLs and identifiers are replaced with placeholders before anything leaves.

**What does it cost?** With the default engine, translations are calls to that model on your own
account: short prose only, and each line is cached for the session, so a line is never translated
twice. Finished translations are saved in the session file, so a resumed session shows them without
asking again. With `openai` (a local Ollama, say) or `command`, it costs whatever that engine costs.

**What if a translation fails?** Your prompt is sent as you typed it and a notice says why; a reply
block keeps its English and says the translation failed. Nothing is ever blocked.

**Does it work in print or RPC mode?** Prompts are translated in every mode. Reply translations are
drawn in the interactive terminal only.

## Development

```
npm install
pi -e .                 # load it for one run
npm test
npm run check           # tsc
vhs demo/demo.tape && demo/render.sh   # record a demo (needs vhs, ffmpeg, gifsicle)
```

See [DESIGN.md](DESIGN.md) for the unit model and the display rules.

## License

MIT
