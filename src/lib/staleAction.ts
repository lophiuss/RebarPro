// Version skew: every deploy changes the internal IDs of Server Actions. A
// page that was opened BEFORE a deploy (a guard's phone tab left open all
// day) still calls the old IDs, and the new server answers
// "Server Action "…" was not found on the server". Reloading the page picks
// up the new IDs, so instead of showing that cryptic error, tell the user
// plainly and reload.

export function isStaleActionError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err ?? '')
  return /Server Action .* was not found|Failed to find Server Action/i.test(msg)
}

// Drop-in replacement for `alert(prefix + ': ' + err.message)`.
export function reportActionError(err: unknown, prefix = 'Error') {
  if (isStaleActionError(err)) {
    alert('The system was updated while this page was open. The page will reload now — please enter it again.')
    window.location.reload()
    return
  }
  alert(`${prefix}: ${(err as any)?.message ?? err}`)
}
