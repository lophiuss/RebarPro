import { google } from 'googleapis'
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
const client = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET)
client.setCredentials({ refresh_token: env.GOOGLE_REFRESH_TOKEN })
const drive = google.drive({ version: 'v3', auth: client })

const testIds = ['1b1Zcx1Nq1MaNfNi0Z9pUMVUr0cu62rKT', '1p11Ko95VIQ9fsJqiqM7E_zeREFrY8KFi']
for (const id of testIds) {
  try {
    const meta = await drive.files.get({ fileId: id, fields: 'id, name, mimeType, owners, parents' })
    console.log('OK', id, JSON.stringify(meta.data))
  } catch (err) {
    console.log('FAIL', id, err.message)
  }
}

// Also test folder access
try {
  const folder = await drive.files.get({ fileId: '1g52B6lHgYxeYMbuy2ACqYqSGPXKM7oC2', fields: 'id, name' })
  console.log('FOLDER OK', JSON.stringify(folder.data))
} catch (err) {
  console.log('FOLDER FAIL', err.message)
}
