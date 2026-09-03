'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ShieldCheck, Trash2, UserPlus } from 'lucide-react'
import { listPeople, type Person } from './actions'
import { NAV_ITEMS } from '@/components/AppNavigation'

type AccessRow = { user_id: string; department: 'rebar' | 'cement'; role: string }
type NavPermRow = { department: 'rebar' | 'cement'; role: string; nav_key: string }

const ROLES: Record<'rebar' | 'cement', string[]> = {
  rebar: ['admin', 'manager', 'user'],
  cement: ['admin', 'manager', 'supervisor', 'technician'],
}

export default function AccessControlPage() {
  const [profiles, setProfiles] = useState<Person[]>([])
  const [access, setAccess] = useState<AccessRow[]>([])
  const [navPerms, setNavPerms] = useState<NavPermRow[]>([])
  const [myId, setMyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [grantUserId, setGrantUserId] = useState('')
  const [grantDept, setGrantDept] = useState<'rebar' | 'cement'>('rebar')
  const [grantRole, setGrantRole] = useState('user')

  const supabase = createClient()

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    setMyId(user?.id ?? null)

    const [people, accessRes, navPermRes] = await Promise.all([
      listPeople(),
      supabase.from('user_department_access').select('user_id, department, role'),
      supabase.from('department_nav_permissions').select('department, role, nav_key'),
    ])

    setProfiles(people)
    if (accessRes.data) setAccess(accessRes.data)
    if (navPermRes.data) setNavPerms(navPermRes.data)
    setLoading(false)
  }

  // Departments I administer — RLS only returns dept rows I'm an admin of (plus my own rows),
  // so this is also the safe source of truth for what this page can manage.
  const myAdminDepts = Array.from(
    new Set(access.filter(a => a.user_id === myId && a.role === 'admin').map(a => a.department))
  ) as ('rebar' | 'cement')[]

  function accessFor(userId: string, dept: 'rebar' | 'cement') {
    return access.find(a => a.user_id === userId && a.department === dept)
  }

  async function grant(userId: string, dept: 'rebar' | 'cement', role: string) {
    const { error } = await supabase
      .from('user_department_access')
      .upsert([{ user_id: userId, department: dept, role }], { onConflict: 'user_id,department' })
    if (error) {
      alert('Error: ' + error.message)
      return
    }
    load()
  }

  async function revoke(userId: string, dept: 'rebar' | 'cement') {
    if (!confirm('Remove this person\'s access to this department?')) return
    const { error } = await supabase
      .from('user_department_access')
      .delete()
      .eq('user_id', userId)
      .eq('department', dept)
    if (error) {
      alert('Error: ' + error.message)
      return
    }
    load()
  }

  function isNavAllowed(dept: 'rebar' | 'cement', role: string, navKey: string) {
    return navPerms.some(p => p.department === dept && p.role === role && p.nav_key === navKey)
  }

  async function toggleNav(dept: 'rebar' | 'cement', role: string, navKey: string, allow: boolean) {
    // Optimistic update so the checkbox responds immediately.
    setNavPerms(prev => allow
      ? [...prev, { department: dept, role, nav_key: navKey }]
      : prev.filter(p => !(p.department === dept && p.role === role && p.nav_key === navKey)))

    const { error } = allow
      ? await supabase.from('department_nav_permissions').insert([{ department: dept, role, nav_key: navKey }])
      : await supabase.from('department_nav_permissions').delete().eq('department', dept).eq('role', role).eq('nav_key', navKey)

    if (error) { alert('Error: ' + error.message); load() }
  }

  if (loading) return <div className="p-8 text-gray-500">Loading…</div>

  if (myAdminDepts.length === 0) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center">
        <ShieldCheck className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <h1 className="text-lg font-bold text-slate-800">Not an admin</h1>
        <p className="text-sm text-gray-500 mt-1">You need to be an admin in at least one department to manage access.</p>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Access Control</h1>
      <p className="text-sm text-gray-500 mb-8">
        Grant or revoke department access for people who already have an account. New people should
        use <span className="font-medium">Sign Up</span> on the login page first — they'll show up
        below once they do.
      </p>

      {/* Grant form */}
      <div className="mb-8 border rounded-xl bg-white shadow-sm p-5">
        <h2 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><UserPlus className="w-4 h-4" /> Grant Access</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Person</label>
            <select value={grantUserId} onChange={e => setGrantUserId(e.target.value)} className="border rounded-md px-3 py-2 text-sm bg-white w-64">
              <option value="">Select a person…</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name || p.email || p.id}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Department</label>
            <select
              value={grantDept}
              onChange={e => { const d = e.target.value as 'rebar' | 'cement'; setGrantDept(d); setGrantRole(ROLES[d][ROLES[d].length - 1]) }}
              className="border rounded-md px-3 py-2 text-sm bg-white"
            >
              {myAdminDepts.map(d => <option key={d} value={d}>{d === 'rebar' ? 'Rebar' : 'Cement'}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Role</label>
            <select value={grantRole} onChange={e => setGrantRole(e.target.value)} className="border rounded-md px-3 py-2 text-sm bg-white capitalize">
              {ROLES[grantDept].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <button
            disabled={!grantUserId}
            onClick={() => grant(grantUserId, grantDept, grantRole)}
            className="bg-blue-600 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
          >
            Grant
          </button>
        </div>
      </div>

      {/* Access table */}
      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Person</th>
              {myAdminDepts.map(d => (
                <th key={d} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{d === 'rebar' ? 'Rebar' : 'Cement'}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {profiles.map(p => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm">
                  <div className="font-medium">{p.full_name || '(no name)'}</div>
                  <div className="text-xs text-gray-400">{p.email}</div>
                </td>
                {myAdminDepts.map(d => {
                  const row = accessFor(p.id, d)
                  return (
                    <td key={d} className="px-4 py-3">
                      {row ? (
                        <div className="flex items-center gap-2">
                          <select
                            value={row.role}
                            onChange={e => grant(p.id, d, e.target.value)}
                            className="border rounded px-2 py-1 text-xs bg-white capitalize"
                          >
                            {ROLES[d].map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                          <button onClick={() => revoke(p.id, d)} className="text-red-500 hover:text-red-700 p-1" title="Revoke access">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300 italic">No access</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Role permissions: which pages each role can open, per department */}
      <div className="mt-10 space-y-8">
        <div>
          <h2 className="text-xl font-bold">Role Permissions</h2>
          <p className="text-sm text-gray-500 mt-1">
            Choose which pages each role can open. Admin always sees every page and isn&apos;t shown here,
            so a department can never lock out its own admins.
          </p>
        </div>

        {myAdminDepts.map(dept => {
          const roles = ROLES[dept].filter(r => r !== 'admin')
          return (
            <div key={dept} className="bg-white border rounded-xl shadow-sm overflow-x-auto">
              <div className="px-4 py-3 border-b bg-gray-50">
                <h3 className="text-sm font-bold text-slate-700">{dept === 'rebar' ? 'Rebar' : 'Cement'}</h3>
              </div>
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Page</th>
                    {roles.map(r => (
                      <th key={r} className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase capitalize">{r}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {NAV_ITEMS[dept].map(item => (
                    <tr key={item.href}>
                      <td className="px-4 py-2 text-sm font-medium">{item.label}</td>
                      {roles.map(r => (
                        <td key={r} className="px-4 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={isNavAllowed(dept, r, item.href)}
                            onChange={e => toggleNav(dept, r, item.href, e.target.checked)}
                            className="w-4 h-4 accent-blue-600 cursor-pointer"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })}
      </div>
    </div>
  )
}
