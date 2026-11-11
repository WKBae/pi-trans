export type View = 'auto' | 'stacked' | 'interleave' | 'side' | 'below' | 'translated' | 'original'

export const VIEWS: readonly View[] = ['auto', 'stacked', 'interleave', 'side', 'below', 'translated', 'original']

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

/** What the extension keeps in the session file, so a resumed session shows its translations again. */
export type Saved =
  | { kind: 'reply'; key: string; out: (string | null)[]; engine: string }
  | { kind: 'prompt'; key: string; native: string; engine: string }
