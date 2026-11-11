# pi-trans

[English](README.md) · [한국어](README.ko.md) · **日本語** · [简体中文](README.zh-CN.md)

**Pi には自分の言葉で話しかけて。エージェントはそのまま英語で働きます。**

日本語、韓国語、中国語、スペイン語…で入力すると、モデルにはきれいな英語が届きます。モデルは英語で答え、
段落ごとにすぐ下へ控えめな翻訳が付きます。コードには手を触れません。

```
pi install npm:@wkbae/pi-trans
```

## なぜ pi-trans？

- **考えるのは自分の言葉で、セッションは英語のまま。** モデルが読むのは常に英語です。だから回答も、
  リポジトリに書き込むもの（コメント、コミットメッセージ、ドキュメント）も、ほかのコードと同じく英語になります。
- **原文を読み、翻訳はちらっと見るだけ。** 英語が本文として残るので、正確な言い回しや技術用語を見失いません。
  翻訳はその下に淡い色で添えられ、必要なときだけ目をやれば十分です。
- **待ち時間なし。** Enter を押す前にプロンプトの英訳はもう用意されていて、回答の翻訳はバックグラウンドで
  進むのでエージェントを待たせません。

## できること

**入力中の英語プレビュー。** エディタの上の行に、モデルが読む英語が表示されます（`EN ▸ …`）。Enter を
押すとその英語がそのまま送られ、余計な往復はありません。トランスクリプトには入力した文が残り、その下に英語が
付きます：

```
users.js의 loadUsers가 왜 느린지 한 문장으로 말하고 바로 고쳐줘

  ↳ In one sentence, tell me why users.js's loadUsers is slow, then fix it right away
```

**コードをわかっている翻訳。** コードブロック、`インラインコード`、パス、URL、フラグ、`snake_case`、
`camelCase`、`dotted.members` は翻訳エンジンに送りません。プレースホルダーに置き換えて送り、1 バイトも
変えずに戻します。見出し、リスト、引用、表も行ごとに形を保ちます。

**回答の表示方法を選べる。** `/translate view <mode>` でトランスクリプト全体を描き直します：

| 表示 | 見え方 |
| --- | --- |
| `stacked` | モデルが書いたとおりの段落と、そのすぐ下にインデントした淡い色の翻訳 |
| `side` | 左に英語、右に翻訳、ブロックごとに並べて |
| `translated` | 翻訳だけ。コードはその場に |
| `interleave` | 段落ごとに、その翻訳を引用として |
| `below` | 英語の回答全体のあとに翻訳全体 |
| `original` | 英語のみ |
| `auto`（既定） | 140 桁以上のターミナルでは `side`、それ以外は `stacked` |

**どの言語でも、どの翻訳エンジンでも。** 既定では、Pi ですでにサインインしているプロバイダーの小さな
モデル（Haiku モデルがあればそれ）が翻訳します。設定は不要です。ほかのものを使いたければ、OpenAI 互換
サーバー（Ollama、LM Studio、DeepSeek、OpenRouter）や自作のプログラム（Apple Translation、DeepL、
Papago）につなげます。

## 使い方

| コマンド | |
| --- | --- |
| `/translate` | 翻訳のオン・オフ |
| `/translate view <mode>` | 回答の表示方法を変える |
| `/translate status` | 言語、エンジン、表示方法、キュー |
| `/translate:settings` | 下のオプションを変更 |

フッターに、いま動いているものが表示されます（例：`ko↔en · claude-haiku-4-5 · 2 queued`）。

## 言語の設定

pi-trans は次の順に言語を決めます：自身の `language` オプション、システムのロケール（`LC_ALL`、
`LC_MESSAGES`、`LANG`）。コード（`ko`、`ja`、`zh`、`es`）でも名前（`Korean`、`日本語`）でも
構いません。何も設定されていない、または英語なら、何もしません。

## 翻訳エンジン

| エンジン | 設定 | 備考 |
| --- | --- | --- |
| `model`（既定） | 不要 | Pi のプロバイダーのモデルを使う。`model` で選ぶ |
| `openai` | `openaiBaseUrl`、`openaiModel`、任意で `openaiApiKey` | OpenAI 互換サーバーならどれでも：Ollama、LM Studio、DeepSeek、OpenRouter… |
| `command` | `command` | 自作のプログラム：stdin に `{"from","to","lines":[…]}`、stdout に `{"lines":[…]}` |

`openai` や `command` が失敗すると、代わりに `model` が翻訳します（`fallback` をオフにしていなければ）。

## オプション

`/translate:settings` で変更するか、`~/.pi/agent/pi-trans.json` に書いて `/reload` します：

```json
{ "language": "ko", "defaultView": "stacked" }
```

| オプション | 既定値 | |
| --- | --- | --- |
| `language` | 空 | あなたの言語。空ならシステムのロケールに従う |
| `engine` | `model` | `model` · `openai` · `command` |
| `defaultOn` | `true` | Pi の起動時に翻訳をオンにする |
| `defaultView` | `auto` | 上の表示方法を参照 |
| `preview` | `true` | 入力中の英語プレビュー |
| `model` | 空 | model エンジンのモデル。`provider/id` または id。空なら Haiku モデル、なければセッションのモデル |
| `openaiBaseUrl` · `openaiModel` · `openaiApiKey` | | openai エンジン用 |
| `command` | | command エンジン用 |
| `fallback` | `true` | 失敗したら model エンジンで翻訳 |

## よくある質問

**コードは翻訳エンジンに送られますか？** いいえ。送るのは文章だけです。コードブロックは飛ばし、
インラインコード、パス、URL、識別子は外に出る前にプレースホルダーに置き換えます。

**費用はかかりますか？** 既定のエンジンでは、翻訳はあなた自身のアカウントでのそのモデルの呼び出しです。
短い文章だけを送り、各行はセッション中キャッシュされるので、同じ行を二度翻訳することはありません。
仕上がった翻訳はセッションファイルに保存されるので、再開したセッションでも聞き直さずに表示されます。
`openai`（ローカルの Ollama など）や `command` なら、そのエンジンの費用だけです。

**翻訳に失敗したら？** プロンプトは入力したとおりに送られ、通知で理由をお知らせします。回答のブロックは
英語のまま残り、翻訳に失敗したと表示されます。何も止まりません。

**print モードや RPC モードでも動きますか？** プロンプトはどのモードでも翻訳されます。回答の翻訳が
表示されるのは対話型のターミナルだけです。

## 開発

```
npm install
pi -e .                 # load it for one run
npm test
npm run check           # tsc
vhs demo/demo.tape && demo/render.sh   # record a demo (needs vhs, ffmpeg, gifsicle)
```

ユニットモデルと表示ルールは [DESIGN.md](DESIGN.md)（英語）にあります。

## ライセンス

MIT
