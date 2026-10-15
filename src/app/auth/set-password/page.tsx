import { redirect } from 'next/navigation'
import { Factory } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { setPassword } from './actions'

export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<{ message?: string; welcome?: string; force?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?message=' + encodeURIComponent('Your link has expired. Ask for a new invitation.'))
  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
  const welcome = sp.welcome === '1'
  const force = sp.force === '1'
  const field = 'w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center"><Factory className="w-5 h-5 text-white" /></div>
          <span className="text-xl font-bold text-slate-900 tracking-tight">AlphaVision</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-1">{force ? 'Choose a new password' : welcome ? `Welcome${profile?.full_name ? `, ${profile.full_name}` : ''}` : 'Choose a new password'}</h1>
        <p className="text-sm text-gray-500 mb-6">
          {force ? `You signed in with a temporary password${profile?.full_name ? `, ${profile.full_name}` : ''}. Choose your own now: you will use it from now on.` : welcome ? 'Choose a password to finish setting up your account. You will use it, with your e-mail address, to sign in.' : 'Enter the password you want to use from now on.'}
        </p>
        <form action={setPassword} className="flex flex-col gap-4">
          <input type="hidden" name="welcome" value={welcome ? '1' : '0'} />
          <input type="hidden" name="force" value={force ? '1' : '0'} />
          <label className="text-sm font-medium text-slate-700">New password
            <input name="password" type="password" minLength={8} required autoComplete="new-password" className={`${field} mt-1.5`} />
          </label>
          <label className="text-sm font-medium text-slate-700">Confirm password
            <input name="confirm" type="password" minLength={8} required autoComplete="new-password" className={`${field} mt-1.5`} />
          </label>
          <p className="text-xs text-gray-500 -mt-2">At least 8 characters.</p>
          <button className="w-full h-10 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">Save password and continue</button>
          {sp.message && <p className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm text-center">{sp.message}</p>}
        </form>
      </div>
    </div>
  )
}
