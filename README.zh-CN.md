# cc-trans

[English](README.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · **简体中文**

**用你自己的语言和 Claude Code 对话，Claude 照样用英语工作。**

用中文、韩语、日语、西班牙语……输入，Claude 收到的是干净的英文。Claude 用英文回答，每个段落下方紧跟着
一段低调的译文。代码一个字都不动。

![一条韩语提示以英文送达 Claude，Claude 修好文件后，英文回答的每个段落下方都附上浅色译文；随后同一段对话切换为左右对照和仅显示译文](demo/cc-trans.gif)

```
/plugin install cc-trans --marketplace midagedev/cc-trans
```

## 为什么用它

- **用母语思考，会话保持英文。** Claude 读到的始终是英文，所以它的回答，以及它写进仓库的内容（注释、
  提交信息、文档），都和其余代码一样是英文。
- **读原文，扫一眼译文。** 英文仍是正文，确切的措辞和技术术语都在；译文以浅色排在下方，需要时再看。
- **无需等待。** 按下 Enter 之前，提示词的英文已经准备好；回答在后台翻译，从不拖慢 Claude。

## 功能

**输入时实时预览英文。** 输入框上方的横条显示 Claude 将读到的英文（`EN ▸ …`）。按 Enter 就发送这段英文，
没有额外的往返。对话记录里保留你输入的原话，下方附上英文：

```
> 用一句话说明 users.js 的 loadUsers 为什么慢，然后直接修好
  ↳ Explain in one sentence why loadUsers in users.js is slow, then fix it right away
```

**懂代码的翻译。** 代码块、`行内代码`、路径、URL、命令行参数、`snake_case`、`camelCase` 和
`dotted.members` 都不会发给翻译引擎：它们先被替换成占位符，再逐字节原样放回。标题、列表、引用和表格
逐行保持原有结构。

**自选回答的显示方式。** `/translate view <mode>` 会重绘整个对话记录：

| 视图 | 显示内容 |
| --- | --- |
| `stacked` | 按 Claude 写的原样显示每个段落，译文缩进、浅色，紧贴在下方 |
| `side` | 左边英文，右边译文，逐块对齐 |
| `translated` | 只显示译文，代码留在原处 |
| `interleave` | 每个段落之后，以引用形式附上译文 |
| `below` | 先是完整的英文回答，再是完整译文 |
| `original` | 只显示英文 |
| `auto`（默认） | 终端宽度达到 140 列时用 `side`，否则用 `stacked` |

**任何语言，任何翻译引擎。** 默认通过你自己的 Claude Code 会话调用 Claude Haiku 翻译，无需任何设置。
想用别的？可以接入任何兼容 OpenAI 的服务（Ollama、LM Studio、DeepSeek、OpenRouter），或你自己的程序
（Apple Translation、DeepL、Papago）。

## 使用

| 命令 | |
| --- | --- |
| `/translate` | 开启或关闭翻译 |
| `/translate view <mode>` | 切换回答的显示方式 |
| `/translate status` | 语言、引擎、视图和队列 |

输入框下方的提示行会显示正在运行的内容，例如 `zh↔en · haiku · 2 queued`。

## 你的语言

cc-trans 按以下顺序确定你的语言：它自己的 `language` 选项、Claude Code 的 `language` 设置、系统区域
设置（`LANG`）。可以写代码（`ko`、`ja`、`zh`、`es`），也可以写名称（`Korean`、`日本語`）。如果都没有
设置，或设置的是英文，它就不介入。

> **提示：** Claude Code 自带的 `language` 设置也会要求 Claude *用*该语言回答，这样就没有可翻译的内容了。
> 想要英文回答加译文，请把那个设置留空，改为设置 cc-trans 的 `language` 选项。

## 翻译引擎

| 引擎 | 设置 | 说明 |
| --- | --- | --- |
| `haiku`（默认） | 无 | 使用 Claude Code 会话的模型访问权限 |
| `openai` | `openaiBaseUrl`、`openaiModel`，可选 `openaiApiKey` | 任何兼容 OpenAI 的服务：Ollama、LM Studio、DeepSeek、OpenRouter…… |
| `command` | `command` | 你自己的程序：从 stdin 读取 `{"from","to","lines":[…]}`，向 stdout 输出 `{"lines":[…]}` |

`openai` 或 `command` 失败时，改由 `haiku` 翻译（除非关闭了 `fallback`）。

## 选项

在安装时设置，或写在 settings 的 `pluginConfigs["cc-trans"].options` 下。

| 选项 | 默认值 | |
| --- | --- | --- |
| `language` | 空 | 你的语言；留空则依次跟随 Claude Code 的 `language` 设置和系统区域设置 |
| `engine` | `haiku` | `haiku` · `openai` · `command` |
| `view` | `auto` | 见上方的视图 |
| `preview` | `true` | 输入时实时预览英文 |
| `haikuModel` | `haiku` | haiku 引擎使用的模型 |
| `openaiBaseUrl` · `openaiModel` · `openaiApiKey` | | 供 openai 引擎使用 |
| `command` | | 供 command 引擎使用 |
| `fallback` | `true` | 失败时改用 haiku 翻译 |

## 常见问题

**我的代码会发给翻译引擎吗？** 不会。只发送文字：代码块直接跳过，行内代码、路径、URL 和标识符在发出前
都会替换成占位符。

**要花多少钱？** 默认引擎下，翻译是在你的 Claude 账户上调用 Haiku：只发送简短的文字，而且每一行在会话内
都会缓存，同一行不会翻译两次。用 `openai`（比如本地的 Ollama）或 `command` 时，只花那个引擎的费用。

**翻译失败怎么办？** 提示词按你输入的原文发送，并弹出提示说明原因；回答块保留英文，并注明翻译失败。
什么都不会被卡住。

## 开发

```
claude --plugin-dir .          # 加载
claude plugin validate .
claude plugin test .
vhs demo/demo.tape && demo/render.sh   # 重新录制演示（需要 vhs、ffmpeg、gifsicle）
```

单元模型和显示规则见 [DESIGN.md](DESIGN.md)（英文）。

## 许可证

MIT
