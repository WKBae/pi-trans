export type View = 'auto' | 'stacked' | 'interleave' | 'side' | 'below' | 'translated' | 'original'

/** One reply block's translation, keyed by a hash of the block's text. */
export type ReplyEntry = {
  status: 'pending' | 'done' | 'failed' | 'skipped'
  /** Restored translations per unit of planMarkdown(text); null where a unit failed. */
  out: (string | null)[]
  engine: string
  error?: string
}

/** A prompt sent in English, keyed by a hash of the English text. */
export type PromptEntry = { native: string; engine: string }

/** The live preview of the draft. */
export type Preview = { draft: string; english: string | null; status: 'pending' | 'done' | 'failed'; engine: string }

declare module 'claude-code' {
  interface PluginState {
    'cc-trans': {
      enabled: boolean
      view: View | null
      reply: StateFamily<ReplyEntry | null>
      prompt: StateFamily<PromptEntry | null>
      preview: Preview | null
      queued: number
    }
  }
}
