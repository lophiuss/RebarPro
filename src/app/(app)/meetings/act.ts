// Runs a server action from a client component and surfaces failures the same
// way the rest of the app does (alert). Returns undefined on failure.
export async function act<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn()
  } catch (err: any) {
    alert('Error: ' + (err?.message ?? 'Something went wrong'))
    return undefined
  }
}
