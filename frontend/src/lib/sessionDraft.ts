/**
 * Persists live-session transcript to localStorage so a page reload
 * (e.g. after an internet outage) can offer to restore the data.
 *
 * Only the minimum required to call /complete is stored:
 *   sessionId, segments, elapsed
 *
 * Drafts older than 24 h are automatically discarded.
 */
import type { Segment } from '../hooks/useLiveSession'

const DRAFT_KEY  = 'audient_session_draft'
const MAX_AGE_MS = 24 * 60 * 60 * 1000

export interface SessionDraft {
  sessionId: string
  segments:  Segment[]
  elapsed:   number
  savedAt:   number
}

export function writeDraft(
  sessionId: string,
  segments:  Segment[],
  elapsed:   number,
): void {
  if (!sessionId || segments.length === 0) return
  try {
    const draft: SessionDraft = { sessionId, segments, elapsed, savedAt: Date.now() }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch { /* storage quota — ignore */ }
}

export function readDraft(): SessionDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as SessionDraft
    if (!d.sessionId || !Array.isArray(d.segments) || d.segments.length === 0) return null
    if (Date.now() - (d.savedAt ?? 0) > MAX_AGE_MS) { clearDraft(); return null }
    return d
  } catch { return null }
}

export function clearDraft(): void {
  try { localStorage.removeItem(DRAFT_KEY) } catch {}
}
