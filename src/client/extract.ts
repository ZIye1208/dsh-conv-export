/**
 * Conversation extraction: walks the rendered transcript and produces a
 * role-ordered message list the exporters (Markdown / PDF / long image)
 * share.
 *
 * Selectors come from the stock web app's rendered DOM (verified against a
 * live session): user turns hang under a row whose CSS-module class ends in
 * `_userRow` (bubble text inside `[class*="_bubble"]`); assistant turns are
 * rendered markdown under `[class*="_markdown_"]`. Class names are
 * hash-prefixed (`gdEzaW_userRow`), so attribute-contains matching is the
 * stable contract.
 *
 * No cordis, no React — pure DOM helpers, unit-testable against jsdom.
 */

/** Selector of the conversation scrollport the extractor operates within. */
export const SCROLL_SELECTOR = '[data-conversation-scroll]'
/** Selector matching a user turn row. */
export const USER_ROW_SELECTOR = '[class*="_userRow"]'
/** Selector matching the user bubble inside the row. */
export const USER_BUBBLE_SELECTOR = '[class*="_bubble"]'
/** Selector matching an assistant turn's rendered markdown container. */
export const ASSISTANT_MD_SELECTOR = '[class*="_markdown_"]'
/** Selector of the header breadcrumb segment carrying the session title. */
export const TITLE_SELECTOR = '[class*="crumbSeg"]'

/** One extracted turn of the conversation. */
export interface ExtractedMessage {
  /** Who produced the turn. */
  readonly role: 'user' | 'assistant'
  /** Plain text (user turns) — the bubble's visible text. */
  readonly text: string
  /** Rendered HTML (assistant turns) — the markdown container's innerHTML. */
  readonly html: string
}

/**
 * Resolve the conversation scrollport from anywhere in the document.
 * @param from - any element or the document itself.
 * @returns the scrollport element, or null when no conversation is rendered.
 */
export function resolveScope(from: ParentNode = document): HTMLElement | null {
  return from.querySelector<HTMLElement>(SCROLL_SELECTOR)
}

/**
 * Read the session title from the header breadcrumb.
 * @returns the trimmed title, or null when absent.
 */
export function readTitle(): string | null {
  return document.querySelector(TITLE_SELECTOR)?.textContent?.trim() || null
}

/**
 * Extract every rendered turn in document order. User rows and assistant
 * markdown containers are collected with one combined querySelectorAll,
 * which returns document order — so the interleaving is exactly what the
 * reader sees.
 * @param scope - the conversation scrollport (defaults to resolving one).
 * @returns the ordered turns; empty when nothing is rendered.
 */
export function extractMessages(scope?: HTMLElement | null): ExtractedMessage[] {
  const port = scope ?? resolveScope()
  if (port === null) return []
  const nodes = port.querySelectorAll<HTMLElement>(`${USER_ROW_SELECTOR}, ${ASSISTANT_MD_SELECTOR}`)
  const out: ExtractedMessage[] = []
  for (const node of nodes) {
    if (node.matches(USER_ROW_SELECTOR)) {
      const message = fromUserRow(node)
      if (message !== null) out.push(message)
    } else {
      const message = fromMarkdownNode(node)
      if (message !== null) out.push(message)
    }
  }
  return out
}

/**
 * Build one user turn from its row node (bubble text, falling back to the
 * whole row when the bubble class is absent).
 * @param node - the `_userRow` element.
 * @returns the turn, or null when the row renders no text (empty shell).
 */
export function fromUserRow(node: HTMLElement): ExtractedMessage | null {
  const bubble = node.querySelector(USER_BUBBLE_SELECTOR) ?? node
  const text = (bubble.textContent ?? '').trim()
  if (text === '') return null
  return { role: 'user', text, html: '' }
}

/**
 * Build one assistant turn from its markdown container (skip empty shells —
 * still-streaming placeholders render no text yet).
 * @param node - the `_markdown_` element.
 * @returns the turn, or null when the container renders no text.
 */
export function fromMarkdownNode(node: HTMLElement): ExtractedMessage | null {
  const text = (node.textContent ?? '').trim()
  if (text === '') return null
  return { role: 'assistant', text, html: node.innerHTML }
}

/** Per-turn extraction result (the assistant-actions strip's export entry). */
export interface TurnExtract {
  /** The turn(s) inside the anchored wrapper, in document order. */
  readonly messages: readonly ExtractedMessage[]
  /** 1-based ordinal among every assistant markdown container in the pane; 0 = unknown. */
  readonly index: number
}

/**
 * Extract the single turn that owns `anchor` — the per-turn export button
 * rendered into `conversation.chat.assistant-actions`.
 *
 * Resolution order:
 * 1. the nearest `[data-chat-anchor-key]` ancestor (DSH renders one chat-node
 *    seat per turn; extracting inside it yields exactly that segment);
 * 2. fallback — the top-level markdown container closest to the button
 *    (deepest shared ancestor wins), so a future seat rename degrades to
 *    "the reply next to this button" instead of nothing.
 *
 * @param anchor - the per-turn export button (or any node inside the strip).
 * @returns the turn payload, or null when no rendered body is reachable.
 */
export function extractTurn(anchor: Element): TurnExtract | null {
  const port = resolveScope()
  if (port === null) return null

  let messages: ExtractedMessage[] = []
  for (let node: Element | null = anchor.parentElement; node !== null && node !== port;
    node = node.parentElement) {
    if (node instanceof HTMLElement && node.hasAttribute('data-chat-anchor-key')) {
      messages = extractMessages(node)
      break
    }
  }

  if (messages.length === 0) {
    const md = nearestMarkdown(port, anchor)
    if (md === null) return null
    const message = fromMarkdownNode(md)
    if (message === null) return null
    messages = [message]
  }

  return { messages, index: assistantOrdinal(port, messages) }
}

/**
 * Nearest markdown container *above* `md` (ancestors only — `closest`
 * matches self first, so it cannot answer this). Null when `md` renders no
 * markdown ancestor, i.e. it is an outermost body.
 * @param md - the markdown container.
 * @returns the owning ancestor container, or null.
 */
function outermostOwner(md: HTMLElement): HTMLElement | null {
  return md.parentElement?.closest<HTMLElement>(ASSISTANT_MD_SELECTOR) ?? null
}

/**
 * The top-level markdown container sharing the deepest ancestor with
 * `anchor` — the body rendered closest to a strip button.
 * @param port - the conversation scrollport.
 * @param anchor - the per-turn export button.
 * @returns the container, or null when the pane renders no assistant body.
 */
function nearestMarkdown(port: HTMLElement, anchor: Element): HTMLElement | null {
  const all = Array.from(port.querySelectorAll<HTMLElement>(ASSISTANT_MD_SELECTOR))
  // Nested containers (a card rendering markdown inside markdown) collapse to
  // their outermost owner: only outermost candidates are considered.
  const outermost = all.filter((md) => outermostOwner(md) === null)
  let best: HTMLElement | null = null
  let bestDepth = -1
  for (const md of outermost) {
    const common = sharedAncestor(md, anchor)
    if (common === null || common === port) continue
    const depth = ancestorDepth(common, port)
    if (depth > bestDepth) {
      best = md
      bestDepth = depth
    }
  }
  return best
}

/**
 * Nearest common ancestor of two elements.
 * @param a - first element.
 * @param b - second element.
 * @returns their deepest shared ancestor, or null if disconnected.
 */
function sharedAncestor(a: Element, b: Element): Element | null {
  const seen = new Set<Element>()
  for (let node: Element | null = a; node !== null; node = node.parentElement) seen.add(node)
  for (let node: Element | null = b; node !== null; node = node.parentElement) {
    if (seen.has(node)) return node
  }
  return null
}

/**
 * Depth of `node` counted from `root` (root = 0); -1 when not a descendant.
 * @param node - the descendant candidate.
 * @param root - the scrollport.
 * @returns the depth, or -1.
 */
function ancestorDepth(node: Element, root: HTMLElement): number {
  let depth = 0
  let cur: Element | null = node
  while (cur !== null && cur !== root) {
    depth++
    cur = cur.parentElement
  }
  return cur === root ? depth : -1
}

/**
 * 1-based ordinal of the turn's first assistant body among every assistant
 * markdown container in the pane (0 when it is not in document order — e.g.
 * an unmounted wrapper read after a re-render).
 * @param port - the conversation scrollport.
 * @param messages - the extracted turn.
 * @returns the ordinal, or 0 when unknown.
 */
function assistantOrdinal(port: HTMLElement, messages: readonly ExtractedMessage[]): number {
  const target = messages.find((m) => m.role === 'assistant')
  if (target === undefined) return 0
  const all = Array.from(port.querySelectorAll<HTMLElement>(ASSISTANT_MD_SELECTOR))
    .filter((md) => outermostOwner(md) === null)
  const hit = all.findIndex((md) => (md.textContent ?? '').trim() === target.text)
  return hit < 0 ? 0 : hit + 1
}

/**
 * Sanitize a string into a safe download-file stem: path/hostile characters
 * and runs of whitespace collapse to '-', capped at 60 chars.
 * @param raw - the proposed file name stem (e.g. the session title).
 * @returns the sanitized stem (never empty).
 */
export function safeFileStem(raw: string): string {
  const cleaned = raw.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  return cleaned === '' ? 'conversation' : cleaned
}
