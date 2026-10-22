import { uploadSecurityPhoto } from '@/app/(app)/security/actions'
import { isStaleActionError } from '@/lib/staleAction'

// Client-side wrapper for the security photo upload. A guard's phone on a patrol loses signal for a moment, and a
// dropped request used to surface as an unreadable "Minified React error #441". The action itself reports Drive/login
// problems as a normal result; this adds retries for the request not arriving at all, then throws a readable Error.
export async function uploadSecurityPhotoWithRetry(fd: FormData, attempts = 3): Promise<string> {
  let lastErr: unknown
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await uploadSecurityPhoto(fd)
      if (!res.ok) throw Object.assign(new Error(res.error), { final: true }) // the server answered: retrying will not help
      return res.id
    } catch (err: any) {
      if (err?.final || isStaleActionError(err)) throw err
      lastErr = err
      if (i < attempts) await new Promise(r => setTimeout(r, 1500 * i))
    }
  }
  throw new Error(`The photo could not be sent (check your signal and try again). ${String((lastErr as any)?.message ?? '')}`.trim())
}
