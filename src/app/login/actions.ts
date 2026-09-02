'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function login(formData: FormData) {
  const supabase = await createClient()

  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  const { error } = await supabase.auth.signInWithPassword(data)

  if (error) {
    redirect(`/login?message=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function signup(formData: FormData) {
  const supabase = await createClient()

  const data = {
    email: formData.get('email') as string,
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
