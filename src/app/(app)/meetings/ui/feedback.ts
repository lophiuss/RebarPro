// One way to talk to the person: toasts for results and errors, a styled dialog to confirm, and a
// small form to ask for a name. Replaces the browser's alert(), confirm() and prompt() boxes, which
// look out of place and are easy to dismiss by mistake.
//
// Call these from any client code. They work through an event, so they need no provider in the
// component tree; <FeedbackHost /> (mounted once in the Meetings layout) shows them. If the host
// is not on the page for some reason, they fall back to the browser's own boxes.

export type ToastKind = 'error' | 'success' | 'info'
export type ConfirmOptions = { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }
export type TextOptions = { label?: string; confirmLabel?: string; placeholder?: string }

export type FeedbackEvent =
  | { type: 'toast'; message: string; kind: ToastKind }
  | { type: 'confirm'; message: string; options: ConfirmOptions; resolve: (ok: boolean) => void }
  | { type: 'text'; title: string; initial: string; options: TextOptions; resolve: (value: string | null) => void }

export const FEEDBACK_EVENT = 'av-feedback'
// Set by the host while it is mounted.
export const hostState = { mounted: false }

function send(detail: FeedbackEvent) {
  window.dispatchEvent(new CustomEvent<FeedbackEvent>(FEEDBACK_EVENT, { detail }))
}

export function notify(message: string, kind: ToastKind = 'info') {
  if (typeof window === 'undefined') return
  if (!hostState.mounted) { window.alert(message); return }
  send({ type: 'toast', message, kind })
}

export function notifyError(err: unknown, fallback = 'Something went wrong') {
  const message = err instanceof Error ? err.message : typeof err === 'string' && err ? err : (err as { message?: string } | null)?.message
  notify(message || fallback, 'error')
}

export function confirmDialog(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false)
  if (!hostState.mounted) return Promise.resolve(window.confirm(message))
  return new Promise(resolve => send({ type: 'confirm', message, options, resolve }))
}

export function askText(title: string, initial = '', options: TextOptions = {}): Promise<string | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (!hostState.mounted) return Promise.resolve(window.prompt(title, initial))
  return new Promise(resolve => send({ type: 'text', title, initial, options, resolve }))
}
