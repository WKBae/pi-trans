# cc-trans

Write and read in your own language while Claude works in English.

cc-trans is a Claude Code mod. What you type in your language reaches Claude in English; Claude's
English replies are shown with a translation. Code blocks, inline code, paths, URLs, flags and
identifiers never go through the translator, and Markdown structure (headings, lists, quotes, tables)
is kept line for line.

~~~
> `fetchUser()` 이 함수 왜 느린지 봐줘
  ↳ Why is `fetchUser()` slow?

● ## Fix the loop · 루프 고치기
  The loop calls `fetchUser()` on every pass.
  > 루프가 매번 `fetchUser()`를 호출해요.
  ```ts
  for (const id of ids) await fetchUser(id)
  ```
~~~

## Install

```
/plugin install cc-trans --marketplace midagedev/cc-trans
```

## How it works

- **Prompts**: while you type, a band above the prompt shows the English (`EN ▸ …`). Enter sends that
  English, so there is no wait. The transcript row shows what you typed with the English under it.
- **Replies**: each text block is translated in the background (never delaying Claude), blocks on
  screen first. Only prose goes out: each line is split from its Markdown marker, and every code
  span is replaced by a placeholder `⟦0⟧` and put back from the original bytes afterwards.
- **Views** (`/translate view <mode>`):
  - `auto`: side by side when the terminal is 140+ columns wide, otherwise interleaved.
  - `interleave`: each paragraph, then its translation as a quote.
  - `side`: English left, translation right.
  - `below`: the English reply, then the whole translation (code folded).
  - `translated`: the translation only, code in place.
  - `original`: English only.
- **Status**: the hint line under the prompt shows `ko⇄en · haiku` and how many blocks are queued.
- `/translate` toggles; `/translate on|off|status|view <mode>`.

## Engines

| Engine | Setup | Notes |
| --- | --- | --- |
| `haiku` (default) | none | Uses your Claude Code session's own model access |
| `openai` | `openaiBaseUrl`, `openaiModel`, optional `openaiApiKey` | Any OpenAI-compatible server: Ollama, LM Studio, DeepSeek, OpenRouter… |
| `command` | `command` | Your own program: `{"from","to","lines":[…]}` on stdin, `{"lines":[…]}` on stdout. Plug in Apple Translation, DeepL, Papago… |

When `openai` or `command` fails, `haiku` translates instead (unless `fallback` is off).

## Options

Set at install time, or under `pluginConfigs["cc-trans"].options` in settings.

| Option | Default | |
| --- | --- | --- |
| `language` | `ko` | your language, a BCP 47 code |
| `engine` | `haiku` | `haiku` · `openai` · `command` |
| `view` | `auto` | see Views |
| `preview` | `true` | live English preview while typing |
| `replyInEnglish` | `true` | asks Claude to answer in English even if a `language` setting says otherwise |
| `haikuModel` | `haiku` | model for the haiku engine |
| `openaiBaseUrl` · `openaiModel` · `openaiApiKey` | | for the openai engine |
| `command` | | for the command engine |
| `fallback` | `true` | fall back to haiku |

## Development

```
claude --plugin-dir .          # load it
claude plugin validate .
claude plugin test .
```

See [DESIGN.md](DESIGN.md) for the unit model and the display rules.

## License

MIT
