// The mod's own words, in the person's language where we have them.

type Key =
  | 'code'
  | 'translating'
  | 'translatingPrompt'
  | 'promptFailed'
  | 'failed'
  | 'turnedOn'
  | 'turnedOff'
  | 'viewUsage'
  | 'viewSet'
  | 'status'
  | 'language'
  | 'engine'
  | 'view'
  | 'preview'
  | 'queued'
  | 'queuedShort'
  | 'missingOpenai'
  | 'missingCommand'
  | 'languageSetting'
  | 'usage'

const EN: Record<Key, string> = {
  code: 'code',
  translating: 'translating…',
  translatingPrompt: '🔤 Translating to English… ({0})',
  promptFailed: 'Translation failed, sent as typed: {0}',
  failed: 'translation failed',
  turnedOn: 'Translation is on.',
  turnedOff: 'Translation is off.',
  viewUsage: 'Usage: /translate view <{0}>',
  viewSet: 'Replies are shown as: {0}',
  status: 'Translation',
  language: 'Languages',
  engine: 'Engine',
  view: 'View',
  preview: 'Live preview',
  queued: 'Queued',
  queuedShort: '{0} queued',
  missingOpenai: '⚠ The openai engine needs openaiBaseUrl and openaiModel.',
  missingCommand: '⚠ The command engine needs a command.',
  languageSetting: '⚠ Your language setting ({0}) makes Claude answer in your language, so replies need no translation. Turn on replyInEnglish to change that.',
  usage: 'Usage: /translate [on|off|status|view <mode>]',
}

const KO: Record<Key, string> = {
  code: '코드',
  translating: '번역 중…',
  translatingPrompt: '🔤 영어로 번역 중… ({0})',
  promptFailed: '번역에 실패해 입력한 그대로 보냈어요: {0}',
  failed: '번역 실패',
  turnedOn: '번역을 켰어요.',
  turnedOff: '번역을 껐어요.',
  viewUsage: '사용법: /translate view <{0}>',
  viewSet: '답변 표시 방식: {0}',
  status: '번역',
  language: '언어',
  engine: '엔진',
  view: '표시',
  preview: '실시간 미리보기',
  queued: '대기',
  queuedShort: '{0}개 대기',
  missingOpenai: '⚠ openai 엔진에는 openaiBaseUrl과 openaiModel이 필요해요.',
  missingCommand: '⚠ command 엔진에는 command 설정이 필요해요.',
  languageSetting: '⚠ language 설정({0}) 때문에 Claude가 이미 한국어로 답하고 있어서 번역할 답변이 없어요. replyInEnglish를 켜면 영어로 답하게 해요.',
  usage: '사용법: /translate [on|off|status|view <mode>]',
}

const JA: Partial<Record<Key, string>> = {
  code: 'コード',
  translating: '翻訳中…',
  translatingPrompt: '🔤 英語に翻訳中… ({0})',
  promptFailed: '翻訳に失敗したため、入力どおり送信しました: {0}',
  failed: '翻訳失敗',
  turnedOn: '翻訳をオンにしました。',
  turnedOff: '翻訳をオフにしました。',
  queuedShort: '{0}件待ち',
}

const ZH: Partial<Record<Key, string>> = {
  code: '代码',
  translating: '翻译中…',
  translatingPrompt: '🔤 正在翻译成英文… ({0})',
  promptFailed: '翻译失败，已按原文发送: {0}',
  failed: '翻译失败',
  turnedOn: '已开启翻译。',
  turnedOff: '已关闭翻译。',
  queuedShort: '{0} 个排队',
}

const TABLES: Record<string, Partial<Record<Key, string>>> = { ko: KO, ja: JA, zh: ZH }

export function t(lang: string, key: Key, ...args: string[]): string {
  const primary = lang.toLowerCase().split(/[-_]/)[0] ?? ''
  const template: string = TABLES[primary]?.[key] ?? EN[key]
  return template.replace(/\{(\d)\}/g, (_: string, i: string) => args[Number(i)] ?? '')
}
