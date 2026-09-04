'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ShieldCheck, Trash2, UserPlus, Pencil, X, User as UserIcon, Eye, Settings as SettingsIcon, LogOut } from 'lucide-react'
import { listPeople, createPerson, updatePersonProfile, resetPersonPassword, setPersonActive, type Person } from './actions'
import { NAV_ITEMS, type Department } from '@/components/AppNavigation'

// Resize to max 512px and re-encode as ~70%-quality JPEG, same approach as
// the weight-in photo compression.
async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = dataUrl
  })
  const MAX = 512
  let { width, height } = img
  if (width > height) { if (width > MAX) { height *= MAX / width; width = MAX } }
  else if (height > MAX) { width *= MAX / height; height = MAX }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
  return new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob || file), 'image/jpeg', 0.7))
}

type AccessRow = { user_id: string; department: Department; role: string }
type NavPermRow = { department: Department; role: string; nav_key: string }

const DEPT_LABEL: Record<Department, string> = { rebar: 'Rebar', cement: 'Cement', security: 'Security' }

const ROLES: Record<Department, string[]> = {
  rebar: ['admin', 'manager', 'user'],
  cement: ['admin', 'manager', 'supervisor', 'technician'],
  security: ['admin', 'manager', 'security'],
}

// Every department's top role is stored as 'admin' (so is_dept_admin() works
// everywhere unchanged), but Security's own vocabulary calls that role "Boss".
const ROLE_LABEL: Partial<Record<Department, Record<string, string>>> = {
  security: { admin: 'Boss' },
}
function roleLabel(dept: Department, role: string) {
  return ROLE_LABEL[dept]?.[role] ?? role
}

// Mirrors AppNavigation's own SETTINGS_HREF — kept local since that constant
// isn't exported (same reasoning as this page's own DEPT_LABEL/ROLES above).
const SETTINGS_HREF: Record<Department, string> = {
  rebar: '/rebar/settings', cement: '/cement/settings', security: '/security/settings',
}

export default function AccessControlPage() {
  const [profiles, setProfiles] = useState<Person[]>([])
  const [access, setAccess] = useState<AccessRow[]>([])
  const [navPerms, setNavPerms] = useState<NavPermRow[]>([])
  const [myId, setMyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [grantUserId, setGrantUserId] = useState('')
  const [grantRole, setGrantRole] = useState('user')
  const [activeDept, setActiveDept] = useState<Department | null>(null)

  const [showAddPerson, setShowAddPerson] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newFullName, setNewFullName] = useState('')
  const [addingPerson, setAddingPerson] = useState(false)

  const [editPerson, setEditPerson] = useState<Person | null>(null)
  const [editName, setEditName] = useState('')
  const [editAvatarFile, setEditAvatarFile] = useState<File | null>(null)
  const [editAvatarPreview, setEditAvatarPreview] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editNewPassword, setEditNewPassword] = useState('')
  const [resettingPassword, setResettingPassword] = useState(false)
  const [togglingActive, setTogglingActive] = useState<string | null>(null)
  const [viewAsPerson, setViewAsPerson] = useState<Person | null>(null)
  const [viewAsDept, setViewAsDept] = useState<Department | null>(null)

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
  ) as (Department)[]

  const currentDept: Department | null = (activeDept && myAdminDepts.includes(activeDept)) ? activeDept : (myAdminDepts[0] ?? null)

  function accessFor(userId: string, dept: Department) {
    return access.find(a => a.user_id === userId && a.department === dept)
  }

  async function grant(userId: string, dept: Department, role: string) {
    const { error } = await supabase
      .from('user_department_access')
      .upsert([{ user_id: userId, department: dept, role }], { onConflict: 'user_id,department' })
    if (error) {
      alert('Error: ' + error.message)
      return
    }
    load()
  }

  async function revoke(userId: string, dept: Department) {
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

  async function addPerson() {
    if (!newEmail.trim() || !newPassword) { alert('Email and password are required'); return }
    setAddingPerson(true)
    try {
      await createPerson(newEmail, newPassword, newFullName)
      setShowAddPerson(false)
      setNewEmail(''); setNewPassword(''); setNewFullName('')
      await load()
    } catch (err: any) {
      alert('Error creating person: ' + err.message)
    } finally {
      setAddingPerson(false)
    }
  }

  function openEdit(p: Person) {
    setEditPerson(p)
    setEditName(p.full_name || '')
    setEditAvatarFile(null)
    setEditAvatarPreview(p.avatar_url)
    setEditNewPassword('')
  }

  function pickAvatarFile(file: File | null) {
    setEditAvatarFile(file)
    if (file) setEditAvatarPreview(URL.createObjectURL(file))
  }

  async function saveEdit() {
    if (!editPerson) return
    setSavingEdit(true)
    try {
      let avatarUrl: string | undefined = undefined
      if (editAvatarFile) {
        const blob = await compressImage(editAvatarFile)
        const path = `${editPerson.id}/${Date.now()}.jpg`
        const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: true })
        if (uploadErr) throw uploadErr
        avatarUrl = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
      }
      await updatePersonProfile(editPerson.id, editName, avatarUrl)
      setEditPerson(null)
      await load()
    } catch (err: any) {
      alert('Error saving: ' + err.message)
    } finally {
      setSavingEdit(false)
    }
  }

  async function doResetPassword() {
    if (!editPerson) return
    if (editNewPassword.length < 6) { alert('Password must be at least 6 characters'); return }
    if (!confirm(`Reset the password for ${editPerson.email}?`)) return
    setResettingPassword(true)
    try {
      await resetPersonPassword(editPerson.id, editNewPassword)
      alert('Password reset.')
      setEditNewPassword('')
    } catch (err: any) {
      alert('Error resetting password: ' + err.message)
    } finally {
      setResettingPassword(false)
    }
  }

  async function toggleActive(p: Person) {
    const next = !p.is_active
    if (p.id === myId) { alert("You can't deactivate your own account"); return }
    if (!next && !confirm(`Deactivate ${p.full_name || p.email}? They will be signed out and won't be able to log in until reactivated.`)) return
    setTogglingActive(p.id)
    // Optimistic — flip the badge immediately, the table doesn't otherwise change.
    setProfiles(prev => prev.map(x => x.id === p.id ? { ...x, is_active: next } : x))
    try {
      await setPersonActive(p.id, next)
    } catch (err: any) {
      alert('Error: ' + err.message)
      setProfiles(prev => prev.map(x => x.id === p.id ? { ...x, is_active: p.is_active } : x))
    } finally {
      setTogglingActive(null)
    }
  }

  function openViewAs(p: Person) {
    const depts = access.filter(a => a.user_id === p.id)
    if (depts.length === 0) { alert(`${p.full_name || p.email} has no department access yet — there's nothing to preview.`) ; return }
    setViewAsPerson(p)
    setViewAsDept(depts[0].department)
  }

  // Reproduces AppNavigation's own nav-building rules (isAllowed/navItems/
  // canSeeSettings) for a chosen person + department, so this is an accurate
  // preview and not a second, driftable copy of the logic. Since this app's
  // RLS is department-scoped only (role only ever hides/shows nav, never
  // data — see AGENTS notes), this preview is a complete stand-in for
  // actually logging in as them, with none of the risk of a real
  // impersonation feature.
  function viewAsNavPreview(p: Person, dept: Department) {
    const role = access.find(a => a.user_id === p.id && a.department === dept)?.role ?? ''
    const isAllowed = (navKey: string) =>
      role === 'admin' || navPerms.some(perm => perm.department === dept && perm.role === role && perm.nav_key === navKey)
    const settingsHref = SETTINGS_HREF[dept]
    const items = NAV_ITEMS[dept].filter(item => item.href !== settingsHref && isAllowed(item.href))
    const canSeeSettings = isAllowed(settingsHref)
    const isAdminAnywhere = access.some(a => a.user_id === p.id && a.role === 'admin')
    return { role, items, canSeeSettings, isAdminAnywhere }
  }

  function isNavAllowed(dept: Department, role: string, navKey: string) {
    return navPerms.some(p => p.department === dept && p.role === role && p.nav_key === navKey)
  }

  async function toggleNav(dept: Department, role: string, navKey: string, allow: boolean) {
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
      <div className="flex items-start justify-between gap-4 mb-2">
        <h1 className="text-3xl font-bold">Access Control</h1>
        <button
          onClick={() => setShowAddPerson(true)}
          className="flex items-center gap-1.5 bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800 flex-shrink-0"
        >
          <UserPlus className="w-4 h-4" /> Add Person
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Grant or revoke department access for people who already have an account. New people can
        either use <span className="font-medium">Sign Up</span> on the login page, or be added
        directly with <span className="font-medium">Add Person</span> above.
      </p>

      {/* Department tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
        {myAdminDepts.map(d => (
          <button
            key={d}
            onClick={() => { setActiveDept(d); setGrantRole(ROLES[d][ROLES[d].length - 1]); setGrantUserId('') }}
            className={`px-4 py-2 rounded-md text-sm font-semibold transition ${currentDept === d ? 'bg-white shadow-sm text-slate-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {DEPT_LABEL[d]}
          </button>
        ))}
      </div>

      {currentDept && (() => {
        const dept = currentDept
        const deptPeople = profiles.filter(p => accessFor(p.id, dept))
        const grantablePeople = profiles.filter(p => !accessFor(p.id, dept))
        const roles = ROLES[dept].filter(r => r !== 'admin')
        return (
          <>
            {/* Grant form */}
            <div className="mb-8 border rounded-xl bg-white shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><UserPlus className="w-4 h-4" /> Grant {DEPT_LABEL[dept]} Access</h2>
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Person</label>
                  <select value={grantUserId} onChange={e => setGrantUserId(e.target.value)} className="border rounded-md px-3 py-2 text-sm bg-white w-64">
                    <option value="">Select a person…</option>
                    {grantablePeople.map(p => <option key={p.id} value={p.id}>{p.full_name || p.email || p.id}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Role</label>
                  <select value={grantRole} onChange={e => setGrantRole(e.target.value)} className="border rounded-md px-3 py-2 text-sm bg-white capitalize">
                    {ROLES[dept].map(r => <option key={r} value={r}>{roleLabel(dept, r)}</option>)}
                  </select>
                </div>
                <button
                  disabled={!grantUserId}
                  onClick={() => { grant(grantUserId, dept, grantRole); setGrantUserId('') }}
                  className="bg-blue-600 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
                >
                  Grant
                </button>
                {grantablePeople.length === 0 && <span className="text-xs text-gray-400">Everyone with an account already has {DEPT_LABEL[dept]} access.</span>}
              </div>
            </div>

            {/* People with access to this department */}
            <div className="bg-white border rounded-xl shadow-sm overflow-x-auto mb-10">
              <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-700">{DEPT_LABEL[dept]} — {deptPeople.length} {deptPeople.length === 1 ? 'person' : 'people'}</h2>
              </div>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Person</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {deptPeople.map(p => {
                    const row = accessFor(p.id, dept)!
                    return (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm">
                          <div className="flex items-center gap-3">
                            {p.avatar_url ? (
                              <img src={p.avatar_url} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center flex-shrink-0"><UserIcon className="w-4 h-4" /></div>
                            )}
                            <div className="min-w-0">
                              <div className="font-medium truncate flex items-center gap-1.5">
                                {p.full_name || '(no name)'}
                                {!p.is_active && <span className="text-[10px] font-bold uppercase bg-red-100 text-red-700 rounded-full px-1.5 py-0.5 flex-shrink-0">Inactive</span>}
                              </div>
                              <div className="text-xs text-gray-400 truncate">{p.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={row.role}
                            onChange={e => grant(p.id, dept, e.target.value)}
                            className="border rounded px-2 py-1 text-xs bg-white capitalize"
                          >
                            {ROLES[dept].map(r => <option key={r} value={r}>{roleLabel(dept, r)}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => toggleActive(p)}
                              disabled={togglingActive === p.id || p.id === myId}
                              title={p.id === myId ? "You can't deactivate your own account" : p.is_active ? 'Deactivate — blocks login' : 'Reactivate'}
                              className={`text-[11px] font-semibold px-2 py-1 rounded-lg flex-shrink-0 disabled:opacity-40 mr-1 ${p.is_active ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-red-50 text-red-700 hover:bg-red-100'}`}
                            >
                              {p.is_active ? 'Active' : 'Inactive'}
                            </button>
                            <button onClick={() => openViewAs(p)} className="text-gray-400 hover:text-blue-600 p-1" title="Preview what this person's sidebar/menu looks like">
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => openEdit(p)} className="text-gray-400 hover:text-blue-600 p-1" title="Edit name, picture, or password">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => revoke(p.id, dept)} className="text-red-500 hover:text-red-700 p-1" title="Revoke access">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {deptPeople.length === 0 && (
                    <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">Nobody has {DEPT_LABEL[dept]} access yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Role permissions: which pages each role can open, in this department */}
            <div className="mb-10">
              <h2 className="text-xl font-bold">Role Permissions — {DEPT_LABEL[dept]}</h2>
              <p className="text-sm text-gray-500 mt-1 mb-4">
                Choose which pages each role can open. Admin always sees every page and isn&apos;t shown here,
                so a department can never lock out its own admins.
              </p>
              <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Page</th>
                      {roles.map(r => (
                        <th key={r} className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase capitalize">{roleLabel(dept, r)}</th>
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
            </div>
          </>
        )
      })()}

      {/* Add Person modal */}
      {showAddPerson && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Add Person</h2>
              <button onClick={() => setShowAddPerson(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Full Name</label>
                <input value={newFullName} onChange={e => setNewFullName(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Password</label>
                <input type="text" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="At least 6 characters" className="w-full border rounded-md px-3 py-2 text-sm" />
                <p className="text-[11px] text-gray-400 mt-1">Share this with them directly — grant department access below afterwards.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowAddPerson(false)} className="bg-gray-100 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-200">Cancel</button>
              <button onClick={addPerson} disabled={addingPerson} className="bg-blue-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700">
                {addingPerson ? 'Creating...' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Person modal */}
      {editPerson && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Edit Person</h2>
              <button onClick={() => setEditPerson(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex items-center gap-4 mb-4">
              {editAvatarPreview ? (
                <img src={editAvatarPreview} className="w-16 h-16 rounded-full object-cover" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center"><UserIcon className="w-7 h-7" /></div>
              )}
              <div>
                <label className="inline-block bg-gray-100 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-gray-200 cursor-pointer">
                  Change Picture
                  <input type="file" accept="image/*" className="hidden" onChange={e => pickAvatarFile(e.target.files?.[0] ?? null)} />
                </label>
                <p className="text-[11px] text-gray-400 mt-1">{editPerson.email}</p>
              </div>
            </div>

            <label className="block text-xs font-medium text-gray-500 mb-1">Full Name</label>
            <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm mb-4" />

            <div className="flex justify-end gap-3 mb-6">
              <button onClick={() => setEditPerson(null)} className="bg-gray-100 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-200">Cancel</button>
              <button onClick={saveEdit} disabled={savingEdit} className="bg-blue-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700">
                {savingEdit ? 'Saving...' : 'Save'}
              </button>
            </div>

            <div className="border-t pt-4">
              <label className="block text-xs font-medium text-gray-500 mb-1">Reset Password</label>
              <div className="flex gap-2">
                <input type="text" value={editNewPassword} onChange={e => setEditNewPassword(e.target.value)} placeholder="New password" className="flex-1 border rounded-md px-3 py-2 text-sm" />
                <button onClick={doResetPassword} disabled={resettingPassword || !editNewPassword} className="bg-red-50 text-red-700 disabled:opacity-40 text-sm font-medium px-3 py-2 rounded-lg hover:bg-red-100 whitespace-nowrap">
                  {resettingPassword ? 'Resetting...' : 'Reset'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View As: a read-only preview of what this person's sidebar/menu
          looks like, built from the same rules AppNavigation itself uses —
          not a real login as them, no session or data access changes. */}
      {viewAsPerson && viewAsDept && (() => {
        const myDepts = access.filter(a => a.user_id === viewAsPerson.id)
        const { role, items, canSeeSettings, isAdminAnywhere } = viewAsNavPreview(viewAsPerson, viewAsDept)
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2"><Eye className="w-5 h-5 text-blue-600" /> View As — {viewAsPerson.full_name || viewAsPerson.email}</h2>
                  <p className="text-xs text-gray-400 mt-0.5">A preview of their menu, not a real login — nothing here changes their session or lets you see their data.</p>
                </div>
                <button onClick={() => setViewAsPerson(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>

              <div className="flex flex-col md:flex-row">
                {/* Simulated sidebar */}
                <div className="w-full md:w-64 bg-slate-900 text-white p-4 flex-shrink-0">
                  <div className="mb-4">
                    <div className="font-bold">AlphaVision</div>
                    <div className="text-xs text-slate-400 truncate">{viewAsPerson.email}</div>
                  </div>
                  {myDepts.length > 1 && (
                    <div className="grid grid-cols-2 gap-1.5 mb-4">
                      {myDepts.map(d => (
                        <button
                          key={d.department}
                          onClick={() => setViewAsDept(d.department)}
                          className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wide transition ${viewAsDept === d.department ? 'bg-blue-600 text-white' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'}`}
                        >
                          {DEPT_LABEL[d.department]}
                        </button>
                      ))}
                    </div>
                  )}
                  <nav className="space-y-1">
                    {items.map(item => (
                      <div key={item.href} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-300">
                        <item.icon className="w-4 h-4 text-slate-400" /> {item.label}
                      </div>
                    ))}
                    <div className="pt-2 my-1 border-t border-slate-800/80" />
                    {canSeeSettings && (
                      <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-300">
                        <SettingsIcon className="w-4 h-4 text-slate-400" /> Settings
                      </div>
                    )}
                    {isAdminAnywhere && (
                      <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-300">
                        <ShieldCheck className="w-4 h-4 text-slate-400" /> Access Control
                      </div>
                    )}
                    <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-300">
                      <UserIcon className="w-4 h-4 text-slate-400" /> My Profile
                    </div>
                    <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-400 mt-2">
                      <LogOut className="w-4 h-4 text-slate-500" /> Sign Out
                    </div>
                  </nav>
                </div>

                {/* Summary panel */}
                <div className="flex-1 p-6">
                  <div className="mb-4">
                    <span className="text-xs font-semibold text-gray-500 uppercase">Viewing as</span>
                    <div className="text-lg font-bold text-slate-800">{DEPT_LABEL[viewAsDept]} · <span className="capitalize">{roleLabel(viewAsDept, role)}</span></div>
                  </div>
                  <p className="text-sm text-gray-500 mb-3">
                    Pages this role can open in {DEPT_LABEL[viewAsDept]} (home page and Sign Out/Profile are always available to everyone):
                  </p>
                  <ul className="space-y-1.5 mb-4">
                    {NAV_ITEMS[viewAsDept].filter(i => i.href !== SETTINGS_HREF[viewAsDept]).map(item => {
                      const allowed = items.some(i => i.href === item.href)
                      return (
                        <li key={item.href} className={`text-sm flex items-center gap-2 ${allowed ? 'text-slate-700' : 'text-gray-300 line-through'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${allowed ? 'bg-green-500' : 'bg-gray-300'}`} /> {item.label}
                        </li>
                      )
                    })}
                    <li className={`text-sm flex items-center gap-2 ${canSeeSettings ? 'text-slate-700' : 'text-gray-300 line-through'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${canSeeSettings ? 'bg-green-500' : 'bg-gray-300'}`} /> Settings
                    </li>
                  </ul>
                  {role === 'admin' && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Admin in this department — always sees every page here, regardless of the Role Permissions table below.
                    </p>
                  )}
                  {myDepts.length === 0 && (
                    <p className="text-xs text-gray-400">No department access — they'd only see the "No access assigned yet" screen.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
