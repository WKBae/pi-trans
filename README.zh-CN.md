# pi-trans

[English](README.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · **简体中文**

**用你自己的语言和 Pi 对话，智能体照样用英语工作。**

用中文、韩语、日语、西班牙语……输入，模型收到的是干净的英文。它用英文回答，每个段落下方紧跟着
一段低调的译文。代码一个字都不动。

```
pi install npm:@wkbae/pi-trans
```

## 为什么用它

- **用母语思考，会话保持英文。** 模型读到的始终是英文，所以它的回答，以及它写进仓库的内容（注释、
  提交信息、文档），都和其余代码一样是英文。
- **读原文，扫一眼译文。** 英文仍是正文，确切的措辞和技术术语都在；译文以浅色排在下方，需要时再看。
- **无需等待。** 按下 Enter 之前，提示词的英文已经准备好；回答在后台翻译，从不拖慢智能体。

## 功能

**输入时实时预览英文。** 编辑器上方的一行显示模型将读到的英文（`EN ▸ …`）。按 Enter 就发送这段英文，
没有额外的往返。对话记录里保留你输入的原话，下方附上英文：

```
users.js의 loadUsers가 왜 느린지 한 문장으로 말하고 바로 고쳐줘

  ↳ In one sentence, tell me why users.js's loadUsers is slow, then fix it right away
```

**懂代码的翻译。** 代码块、`行内代码`、路径、URL、命令行参数、`snake_case`、`camelCase` 和
`dotted.members` 都不会发给翻译引擎：它们先被替换成占位符，再逐字节原样放回。标题、列表、引用和表格
逐行保持原有结构。

**自选回答的显示方式。** `/translate view <mode>` 会重绘整个对话记录：

| 视图 | 显示内容 |
| --- | --- |
| `stacked` | 按模型写的原样显示每个段落，译文缩进、浅色，紧贴在下方 |
| `side` | 左边英文，右边译文，逐块对齐 |
| `translated` | 只显示译文，代码留在原处 |
| `interleave` | 每个段落之后，以引用形式附上译文 |
| `below` | 先是英文回答，再是完整译文 |
| `original` | 只显示英文 |
| `auto`（默认） | 终端宽度达到 140 列时用 `side`，否则用 `stacked` |

**任何语言，任何翻译引擎。** 默认从你已在 Pi 中登录的提供商里选一个小模型来翻译（有 Haiku 模型时就用
它），无需任何设置。想用别的？可以接入任何兼容 OpenAI 的服务（Ollama、LM Studio、DeepSeek、
OpenRouter），或你自己的程序（Apple Translation、DeepL、Papago）。

## 使用

| 命令 | |
| --- | --- |
| `/translate` | 开启或关闭翻译 |
| `/translate view <mode>` | 切换回答的显示方式 |
| `/translate status` | 语言、引擎、视图和队列 |

底部状态行会显示正在运行的内容，例如 `ko↔en · claude-haiku-4-5 · 2 queued`。

## 你的语言

pi-trans 先看它自己的 `language` 选项，再看系统区域设置（`LC_ALL`、`LC_MESSAGES`、`LANG`）来确定你的
语言。可以写代码（`ko`、`ja`、`zh`、`es`），也可以写名称（`Korean`、`日本語`）。如果都没有设置，或设置的
是英文，它就不介入。

## 翻译引擎

| 引擎 | 设置 | 说明 |
| --- | --- | --- |
| `model`（默认） | 无 | 使用你的 Pi 提供商中的模型；由 `model` 选项指定 |
| `openai` | `openaiBaseUrl`、`openaiModel`，可选 `openaiApiKey` | 任何兼容 OpenAI 的服务：Ollama、LM Studio、DeepSeek、OpenRouter…… |
| `command` | `command` | 你自己的程序：从 stdin 读取 `{"from","to","lines":[…]}`，向 stdout 输出 `{"lines":[…]}` |

`openai` 或 `command` 失败时，改由 `model` 翻译（除非关闭了 `fallback`）。

## 选项

写在 `~/.pi/agent/pi-trans.json` 中，然后执行 `/reload`：

```json
{ "language": "ko", "view": "stacked" }
```

| 选项 | 默认值 | |
| --- | --- | --- |
| `language` | 空 | 你的语言；留空则跟随系统区域设置 |
| `engine` | `model` | `model` · `openai` · `command` |
| `view` | `auto` | 见上方的视图 |
| `preview` | `true` | 输入时实时预览英文 |
| `model` | 空 | model 引擎使用的模型，写 `provider/id` 或 id；留空则选一个 Haiku 模型，没有时用会话的模型 |
| `openaiBaseUrl` · `openaiModel` · `openaiApiKey` | | 供 openai 引擎使用 |
| `command` | | 供 command 引擎使用 |
| `fallback` | `true` | 失败时改用 model 引擎翻译 |

## 常见问题

**我的代码会发给翻译引擎吗？** 不会。只发送文字：代码块直接跳过，行内代码、路径、URL 和标识符在发出前
都会替换成占位符。

**要花多少钱？** 默认引擎下，翻译是在你自己的账户上调用那个模型：只发送简短的文字，而且每一行在会话内
都会缓存，同一行不会翻译两次。翻译完成的内容会保存在会话文件里，所以恢复会话时无需重新请求就能显示。
用 `openai`（比如本地的 Ollama）或 `command` 时，只花那个引擎的费用。

**翻译失败怎么办？** 提示词按你输入的原文发送，并弹出提示说明原因；回答块保留英文，并注明翻译失败。
什么都不会被卡住。

**在 print 或 RPC 模式下能用吗？** 所有模式下都会翻译提示词。回答的译文只在交互式终端中显示。

## 开发

```
npm install
pi -e .                 # load it for one run
npm test
npm run check           # tsc
vhs demo/demo.tape && demo/render.sh   # record a demo (needs vhs, ffmpeg, gifsicle)
```

单元模型和显示规则见 [DESIGN.md](DESIGN.md)（英文）。

## 许可证

MIT
