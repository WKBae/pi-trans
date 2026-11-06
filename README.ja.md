# cc-trans

[English](README.md) · [한국어](README.ko.md) · **日本語** · [简体中文](README.zh-CN.md)

**Claude Code には自分の言葉で話しかけて。Claude はそのまま英語で働きます。**

日本語、韓国語、中国語、スペイン語…で入力すると、Claude にはきれいな英語が届きます。Claude は英語で答え、
段落ごとにすぐ下へ控えめな翻訳が付きます。コードには手を触れません。

![韓国語のプロンプトが英語で Claude に届き、Claude がファイルを直したあと、英語の回答の各段落の下に淡い色の翻訳が付く様子。続いて同じトランスクリプトを左右並びと翻訳のみの表示に切り替え](demo/cc-trans.gif)

```
/plugin install cc-trans --marketplace midagedev/cc-trans
```

## なぜ cc-trans？

- **考えるのは自分の言葉で、セッションは英語のまま。** Claude が読むのは常に英語です。だから回答も、
  リポジトリに書き込むもの（コメント、コミットメッセージ、ドキュメント）も、ほかのコードと同じく英語になります。
- **原文を読み、翻訳はちらっと見るだけ。** 英語が本文として残るので、正確な言い回しや技術用語を見失いません。
  翻訳はその下に淡い色で添えられ、必要なときだけ目をやれば十分です。
- **待ち時間なし。** Enter を押す前にプロンプトの英訳はもう用意されていて、回答の翻訳はバックグラウンドで
  進むので Claude を待たせません。

## できること

**入力中の英語プレビュー。** プロンプトの上の帯に、Claude が読む英語が表示されます（`EN ▸ …`）。Enter を
押すとその英語がそのまま送られ、余計な往復はありません。トランスクリプトには入力した文が残り、その下に英語が
付きます：

```
> users.js の loadUsers が遅い理由を一文で説明して、すぐ直して
  ↳ Explain in one sentence why loadUsers in users.js is slow, and fix it right away
```

**コードをわかっている翻訳。** コードブロック、`インラインコード`、パス、URL、フラグ、`snake_case`、
`camelCase`、`dotted.members` は翻訳エンジンに送りません。プレースホルダーに置き換えて送り、1 バイトも
変えずに戻します。見出し、リスト、引用、表も行ごとに形を保ちます。

**回答の表示方法を選べる。** `/translate view <mode>` でトランスクリプト全体を描き直します：

| 表示 | 見え方 |
| --- | --- |
| `stacked` | Claude が書いたとおりの段落と、そのすぐ下にインデントした淡い色の翻訳 |
| `side` | 左に英語、右に翻訳、ブロックごとに並べて |
| `translated` | 翻訳だけ。コードはその場に |
| `interleave` | 段落ごとに、その翻訳を引用として |
| `below` | 英語の回答全体のあとに翻訳全体 |
| `original` | 英語のみ |
| `auto`（既定） | 140 桁以上のターミナルでは `side`、それ以外は `stacked` |

**どの言語でも、どの翻訳エンジンでも。** 既定では、いま使っている Claude Code セッションを通じて
Claude Haiku が翻訳します。設定は不要です。ほかのものを使いたければ、OpenAI 互換サーバー（Ollama、
LM Studio、DeepSeek、OpenRouter）や自作のプログラム（Apple Translation、DeepL、Papago）につなげます。

## 使い方

| コマンド | |
| --- | --- |
| `/translate` | 翻訳のオン・オフ |
| `/translate view <mode>` | 回答の表示方法を変える |
| `/translate status` | 言語、エンジン、表示方法、キュー |

プロンプトの下のヒントに、いま動いているものが表示されます（例：`ja↔en · haiku · 2 queued`）。

## 言語の設定

cc-trans は次の順に言語を決めます：自身の `language` オプション、Claude Code の `language` 設定、
システムのロケール（`LANG`）。コード（`ko`、`ja`、`zh`、`es`）でも名前（`Korean`、`日本語`）でも
構いません。何も設定されていない、または英語なら、何もしません。

> **ヒント：** Claude Code 自体の `language` 設定は、Claude にその言語で*答える*ようにも求めるため、
> 翻訳するものが残りません。英語の回答と翻訳を両方見たいなら、その設定は空のままにして、cc-trans の
> `language` オプションを設定してください。

## 翻訳エンジン

| エンジン | 設定 | 備考 |
| --- | --- | --- |
| `haiku`（既定） | 不要 | Claude Code セッションのモデルアクセスを使う |
| `openai` | `openaiBaseUrl`、`openaiModel`、任意で `openaiApiKey` | OpenAI 互換サーバーならどれでも：Ollama、LM Studio、DeepSeek、OpenRouter… |
| `command` | `command` | 自作のプログラム：stdin に `{"from","to","lines":[…]}`、stdout に `{"lines":[…]}` |

`openai` や `command` が失敗すると、代わりに `haiku` が翻訳します（`fallback` をオフにしていなければ）。

## オプション

インストール時に設定するか、settings の `pluginConfigs["cc-trans"].options` に書きます。

| オプション | 既定値 | |
| --- | --- | --- |
| `language` | 空 | あなたの言語。空なら Claude Code の `language` 設定、次にシステムのロケールに従う |
| `engine` | `haiku` | `haiku` · `openai` · `command` |
| `view` | `auto` | 上の表示方法を参照 |
| `preview` | `true` | 入力中の英語プレビュー |
| `haikuModel` | `haiku` | haiku エンジンのモデル |
| `openaiBaseUrl` · `openaiModel` · `openaiApiKey` | | openai エンジン用 |
| `command` | | command エンジン用 |
| `fallback` | `true` | 失敗したら haiku で翻訳 |

## よくある質問

**コードは翻訳エンジンに送られますか？** いいえ。送るのは文章だけです。コードブロックは飛ばし、
インラインコード、パス、URL、識別子は外に出る前にプレースホルダーに置き換えます。

**費用はかかりますか？** 既定のエンジンでは、翻訳はあなたの Claude アカウントでの Haiku 呼び出しです。
短い文章だけを送り、各行はセッション中キャッシュされるので、同じ行を二度翻訳することはありません。
`openai`（ローカルの Ollama など）や `command` なら、そのエンジンの費用だけです。

**翻訳に失敗したら？** プロンプトは入力したとおりに送られ、トーストで理由をお知らせします。回答のブロックは
英語のまま残り、翻訳に失敗したと表示されます。何も止まりません。

## 開発

```
claude --plugin-dir .          # 読み込む
claude plugin validate .
claude plugin test .
vhs demo/demo.tape && demo/render.sh   # デモを撮り直す（vhs、ffmpeg、gifsicle が必要）
```

ユニットモデルと表示ルールは [DESIGN.md](DESIGN.md)（英語）にあります。

## ライセンス

MIT
