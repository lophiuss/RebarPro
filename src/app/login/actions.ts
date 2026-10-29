'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { sendSecurityAlert } from '@/lib/security-alerts'

export async function login(formData: FormData) {
  const supabase = await createClient()

  const data = {
    email: (formData.get('email') as string || '').trim().toLowerCase(),
    password: formData.get('password') as string,
  }

  const { error } = await supabase.auth.signInWithPassword(data)

  if (error) {
    const headersList = await headers()
    const ip = headersList.get('x-forwarded-for')?.split(',')[0].trim() || headersList.get('x-real-ip') || 'Unknown IP'
    const userAgent = headersList.get('user-agent') || 'Unknown Device'

    // Immediate security alert to davidthen4285@gmail.com and david.then@komt.com.my
    await sendSecurityAlert({
      event_type: 'failed_login',
      email: data.email,
      ip,
      user_agent: userAgent,
      path: '/login',
      severity: 'HIGH',
      details: {
        error: error.message,
        timestamp: new Date().toISOString(),
        note: 'Someone attempted to log into this account with an incorrect or unauthorized password.'
      }
    })

    redirect(`/login?message=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function signup(formData: FormData) {
  const supabase = await createClient()

  const data = {
    email: (formData.get('email') as string || '').trim().toLowerCase(),
    password: formData.get('password') as string,
    options: {
      data: {
        full_name: formData.get('full_name') as string,
      }
    }
  }

  const { error, data: authData } = await supabase.auth.signUp(data)

  if (error) {
    redirect(`/login?message=${encodeURIComponent(error.message)}`)
  }

  // If email confirmation is enabled, session will be null
  if (authData.user && !authData.session) {
    redirect('/login?message=Check your email for the confirmation link.')
  }

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function sendTestSecurityAlert() {
  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for')?.split(',')[0].trim() || headersList.get('x-real-ip') || 'Unknown IP'
  const userAgent = headersList.get('user-agent') || 'Unknown Device'

  await sendSecurityAlert({
    event_type: 'sample_test',
    email: 'davidthen4285@gmail.com',
    ip,
    user_agent: userAgent,
    path: '/admin/security-test',
    severity: 'TEST',
    details: {
      test: true,
      message: 'Manual security alert test triggered to verify email delivery.',
      recipients: ['davidthen4285@gmail.com', 'david.then@komt.com.my'],
    }
  })

  return { ok: true }
}
