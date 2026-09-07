// One-off: seed maintenance_checklist_templates/_items from
// checklist_templates.json (built by build_checklist_templates.py from the
// real KOM Technologies paper forms the user provided).
//
// Run with: node scripts/maintenance-migration/upload_checklist_templates.mjs
//
// Idempotent-ish: skips a template whose name already exists rather than
// duplicating it (re-run after fixing a typo in one template by deleting
// that one row first, e.g. via Settings).

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
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
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const templates = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'maintenance-migration', 'checklist_templates.json'), 'utf8'))

async function main() {
  const { data: existing, error: exErr } = await sb.from('maintenance_checklist_templates').select('name')
  if (exErr) throw exErr
  const existingNames = new Set((existing || []).map(t => t.name))

  let created = 0, skipped = 0, itemCount = 0
  for (const t of templates) {
    if (existingNames.has(t.name)) {
      console.log(`Skipping "${t.name}" — a template with this name already exists`)
      skipped++
      continue
    }
    const { data: tmpl, error: tErr } = await sb.from('maintenance_checklist_templates').insert([{
      name: t.name, scope: t.scope, frequency: t.frequency, form_code: t.form_code,
    }]).select('id').single()
    if (tErr) throw new Error(`template "${t.name}" insert failed: ${tErr.message}`)

    let itemNo = 0
    const rows = []
    for (const [sectionLabel, items] of t.sections) {
      for (const description of items) {
        itemNo++
        rows.push({ template_id: tmpl.id, section_label: sectionLabel, item_no: itemNo, description })
      }
    }
    const { error: iErr } = await sb.from('maintenance_checklist_items').insert(rows)
    if (iErr) throw new Error(`items for "${t.name}" insert failed: ${iErr.message}`)

    console.log(`Created "${t.name}" — ${rows.length} items`)
    created++
    itemCount += rows.length
  }

  console.log(`\nDone. ${created} templates created (${itemCount} items), ${skipped} skipped as already existing.`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
