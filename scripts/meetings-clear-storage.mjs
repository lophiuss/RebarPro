// Removes every uploaded file from the meeting-docs bucket (documents and whiteboard pictures).
//   node --env-file=.env.local scripts/meetings-clear-storage.mjs
import { createClient } from '@supabase/supabase-js'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })
const bucket = db.storage.from('meeting-docs')

async function listAll(prefix) {
  const files = []
  const { data, error } = await bucket.list(prefix, { limit: 1000 })
  if (error) throw error
  for (const e of data) {
    const path = prefix ? `${prefix}/${e.name}` : e.name
    if (e.id === null) files.push(...(await listAll(path))) // a folder
    else files.push(path)
  }
  return files
}

const files = await listAll('')
if (files.length) {
  const { error } = await bucket.remove(files)
  if (error) throw error
}
console.log('removed', files.length, 'files')
