import { createClient } from '@/lib/supabase/client'

export type EmailResult = { sent: number; skipped: string[]; failed: string[] }

// Asks the send-meeting-summary edge function to e-mail a concluded meeting's
// minutes. With no recipient_ids it goes to every attendee. Each person gets
// their own separate e-mail. Throws with a readable message on failure.
export async function emailSummary(
  summaryId: string,
  opts: { includeDetails: boolean; includeNotes: boolean; recipientIds?: string[]; subject?: string; message?: string },
): Promise<EmailResult> {
  const supabase = createClient()
  const { data, error } = await supabase.functions.invoke('send-meeting-summary', {
    body: {
      summary_id: summaryId,
      include_details: opts.includeDetails,
      include_notes: opts.includeNotes,
      recipient_ids: opts.recipientIds,
      subject: opts.subject,
      message: opts.message,
    },
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
  return { sent: data?.sent ?? 0, skipped: data?.skipped ?? [], failed: data?.failed ?? [] }
}
