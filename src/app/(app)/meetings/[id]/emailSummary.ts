import { createClient } from '@/lib/supabase/client'

// Asks the send-meeting-summary edge function to e-mail a concluded meeting's
// summary to all attendees. Throws with a readable message on failure.
export async function emailSummary(summaryId: string, opts: { includeDetails: boolean; includeNotes: boolean }) {
  const supabase = createClient()
  const { data, error } = await supabase.functions.invoke('send-meeting-summary', {
    body: { summary_id: summaryId, include_details: opts.includeDetails, include_notes: opts.includeNotes },
  })
  if (error) {
    // FunctionsHttpError carries the function's JSON body in error.context.
    let detail = error.message
    try {
      const body = await (error as any).context?.json?.()
      if (body?.error) detail = body.error
    } catch { /* keep the generic message */ }
    throw new Error(detail)
  }
  return (data?.sent ?? 0) as number
}
