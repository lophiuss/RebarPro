'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function setPassword(formData: FormData) {
  const password = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')
  const welcome = formData.get('welcome') === '1'
  const force = formData.get('force') === '1'
  const back = (msg: string) => redirect(`/auth/set-password?${welcome ? 'welcome=1&' : ''}${force ? 'force=1&' : ''}message=${encodeURIComponent(msg)}`)

  if (password.length < 10) back('Use at least 10 characters.')
  if (password !== confirm) back('The two passwords do not match.')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?message=' + encodeURIComponent('Your link has expired. Ask for a new invitation.'))

  const { error } = await supabase.auth.updateUser({ password })
  if (error) back(error.message)
  // The temporary password is gone: lift the "must change" flag.
  if ((user.app_metadata as { must_change_password?: boolean } | undefined)?.must_change_password) {
    await createAdminClient().auth.admin.updateUserById(user.id, { app_metadata: { must_change_password: false } })
    // The sign-in token still carries the old flag; get a fresh one so the app stops asking.
    await supabase.auth.refreshSession()
  }
  redirect('/')
}
