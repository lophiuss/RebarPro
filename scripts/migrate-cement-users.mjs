// One-off migration: cement-app's 7 legacy users (weighbridge.db `users` table,
// plaintext passwords, no email) -> Supabase Auth accounts + cement department access.
//
// Each gets a placeholder email `<username>@cement.local` and their EXISTING
// password as their initial password, so nobody is locked out. They can add a
// real email / change password later. Cement-only access is granted (no
// automatic rebar access, including for the two cement "admin" role users —
// department access is granted separately via /admin/access if ever needed).
//
// Run with:  node --experimental-sqlite scripts/migrate-cement-users.mjs
//
// Never logs passwords. Idempotent: re-running skips usernames that already
// have a <username>@cement.local account.

import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

function loadEnv(file) {
  const out = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}
const env = loadEnv(path.join(ROOT, '.env.local'))
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SECRET_KEY = env.SUPABASE_SECRET_KEY
if (!SUPABASE_URL || !SECRET_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY in .env.local')
}

const db = new DatabaseSync(path.join(ROOT, 'cement-app', 'weighbridge.db'), { readOnly: true })
const users = db.prepare('SELECT username, password, role FROM users').all()
db.close()

async function adminFetch(pathname, init) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin${pathname}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET_KEY}`, apikey: SECRET_KEY, ...init?.headers },
  })
  const body = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, body }
}

async function grantCementAccess(userId, role) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/user_department_access`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SECRET_KEY}`,
      apikey: SECRET_KEY,
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify([{ user_id: userId, department: 'cement', role }]),
  })
  if (!res.ok) throw new Error(`grant access failed (${res.status}): ${await res.text()}`)
}

const results = []
for (const u of users) {
  const email = `${u.username}@cement.local`

  const created = await adminFetch('/users', {
    method: 'POST',
    body: JSON.stringify({ email, password: u.password, email_confirm: true, user_metadata: { full_name: u.username } }),
  })

  let userId
  if (created.ok) {
    userId = created.body.id
  } else if (created.status === 422 || /already.*registered/i.test(JSON.stringify(created.body))) {
    // Already migrated in a prior run — look it up instead of failing.
    const list = await adminFetch(`/users?email=${encodeURIComponent(email)}`, { method: 'GET' })
    userId = list.body?.users?.[0]?.id
    if (!userId) throw new Error(`Could not find existing user for ${email}`)
  } else {
    throw new Error(`Create failed for ${email} (${created.status}): ${JSON.stringify(created.body)}`)
  }

  await grantCementAccess(userId, u.role)
  results.push({ username: u.username, email, role: u.role, status: created.ok ? 'created' : 'already existed' })
}

console.log('\nCement accounts:')
for (const r of results) console.log(`  ${r.username.padEnd(12)} -> ${r.email.padEnd(28)} cement:${r.role.padEnd(11)} (${r.status})`)
console.log(`\n${results.length} accounts ready. Initial password = their existing cement-app password; encourage them to change it.`)
