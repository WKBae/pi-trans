// The extension's own words. Always English, like Pi's own interface:
// only the translations are in the person's language.

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
  | 'missingModel'
  | 'usage'
  | 'from_option'
  | 'from_locale'
  | 'from_none'
  | 'settingsTitle'
  | 'settingsNeedTui'
  | 'settingsFailed'
  | 'notSet'
  | 'locale'
  | 'auto'
  | 'autoModel'
  | 'autoModelNote'
  | 'unavailable'
  | 'set_defaultOn'
  | 'about_defaultOn'
  | 'set_defaultView'
  | 'about_defaultView'
  | 'set_language'
  | 'about_language'
  | 'set_engine'
  | 'about_engine'
  | 'set_model'
  | 'about_model'
  | 'set_preview'
  | 'about_preview'
  | 'set_fallback'
  | 'about_fallback'
  | 'set_openaiBaseUrl'
  | 'about_openaiBaseUrl'
  | 'set_openaiModel'
  | 'about_openaiModel'
  | 'set_openaiApiKey'
  | 'about_openaiApiKey'
  | 'set_command'
  | 'about_command'
  | 'view_auto'
  | 'view_stacked'
  | 'view_interleave'
  | 'view_side'
  | 'view_below'
  | 'view_translated'
  | 'view_original'
  | 'engine_model'
  | 'engine_openai'
  | 'engine_command'

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
  missingModel: '⚠ No model with credentials for the model engine: set model to provider/id.',
  missingCommand: '⚠ The command engine needs a command.',
  usage: 'Usage: /translate [on|off|status|view <mode>]',
  from_option: 'from the language option',
  from_locale: 'from the system locale',
  from_none: 'nothing set: no translation',
  settingsTitle: 'pi-trans settings',
  settingsNeedTui: 'Change the settings in the interactive TUI, or edit {0}.',
  settingsFailed: 'Cannot save {0}: {1}',
  notSet: 'not set',
  locale: 'system locale',
  auto: 'auto',
  autoModel: 'auto ({0})',
  autoModelNote: "A Haiku model with credentials, else the session's model.",
  unavailable: '{0} (unavailable)',
  set_defaultOn: 'Default on',
  about_defaultOn: 'Whether translation is on when Pi starts. /translate on and off change it until Pi restarts.',
  set_defaultView: 'Default view',
  about_defaultView: 'How replies are drawn. /translate view changes it until Pi restarts.',
  set_language: 'Language',
  about_language: 'Your language, as a code (ko) or a name (Korean). Empty uses the system locale. Applies next session.',
  set_engine: 'Engine',
  about_engine: 'What translates: a Pi model, an OpenAI-compatible server, or your own command.',
  set_model: 'Model',
  about_model: 'The Pi model for the model engine and the fallback. Type to search.',
  set_preview: 'Live preview',
  about_preview: 'Show the English of a resting draft above the editor.',
  set_fallback: 'Fallback',
  about_fallback: 'When the openai or command engine fails, translate with the model engine.',
  set_openaiBaseUrl: 'OpenAI base URL',
  about_openaiBaseUrl: 'Base URL of an OpenAI-compatible server, such as http://localhost:11434/v1.',
  set_openaiModel: 'OpenAI model',
  about_openaiModel: 'Model name on that server.',
  set_openaiApiKey: 'OpenAI API key',
  about_openaiApiKey: 'Sent as a bearer token. Saved in the options file, readable by you only. Enter on an empty line removes it.',
  set_command: 'Command',
  about_command: 'Gets {"from","to","lines"} as JSON on stdin and prints {"lines"}.',
  view_auto: 'side when the message area is wide enough, else stacked',
  view_stacked: 'each block, its translation under it',
  view_interleave: 'each block, its translation as a quote',
  view_side: 'English left, translation right',
  view_below: 'the reply, then the whole translation',
  view_translated: 'the translation only',
  view_original: 'no translation',
  engine_model: 'a model from your Pi providers',
  engine_openai: 'an OpenAI-compatible server',
  engine_command: 'your own command',
}

export function t(key: Key, ...args: string[]): string {
  return EN[key].replace(/\{(\d)\}/g, (_: string, i: string) => args[Number(i)] ?? '')
}
