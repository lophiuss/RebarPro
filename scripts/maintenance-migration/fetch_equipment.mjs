import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))))
function loadEnv(file) {
  const out = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}
const env = loadEnv(path.join(ROOT, '.env.local'))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const { data, error } = await sb.from('maintenance_equipment').select('id, name, category').eq('is_active', true).order('id')
if (error) throw error
writeFileSync(path.join(ROOT, 'scripts', 'maintenance-migration', 'equipment_registry.json'), JSON.stringify(data, null, 2))
console.log(`Wrote ${data.length} equipment rows`)
