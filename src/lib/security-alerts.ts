import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

export type SecurityAlertPayload = {
  event_type: 'failed_login' | 'deactivated_account_access' | 'admin_role_change' | 'unauthorized_access' | 'sample_test'
  email?: string
  ip?: string
  user_agent?: string
  path?: string
  details?: Record<string, unknown> | string
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'TEST'
  recipients?: string[]
}

export async function sendSecurityAlert(payload: SecurityAlertPayload): Promise<void> {
  try {
    const supabase = createAdminClient()
    await supabase.functions.invoke('send-security-alert', {
      body: payload,
    })
  } catch (err: any) {
    console.error('[sendSecurityAlert] Failed to dispatch security alert:', err?.message || err)
  }
}
