import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { upsertProfile } from '../lib/auth'
import PageWrapper from '../components/layout/PageWrapper'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import { supabase } from '../lib/supabase'
import AvatarUpload from '../components/ui/AvatarUpload'

export default function CustomerSettings() {
  const { profile, user, refreshProfile } = useAuth()
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone_number: '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState(null)

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name || '',
        email: profile.email || '',
        phone_number: profile.phone_number?.toString() || '',
      })
    }
  }, [profile])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)

    if (form.phone_number && !/^\d+$/.test(form.phone_number)) {
      alert('Phone number must contain only digits')
      setSaving(false)
      return
    }

    const { error } = await upsertProfile({
      id: profile.id,
      full_name: form.full_name,
      email: form.email,
      phone_number: form.phone_number ? parseInt(form.phone_number) : null,
      role: profile.role,
      slug: profile.slug,
    })

    if (error) {
      alert(error.message)
    } else {
      await refreshProfile()
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }

    setSaving(false)
  }

  // Save avatar immediately after upload (optional for customers)
  async function handleAvatarUpload(publicUrl) {
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', profile.id)

    if (error) {
      console.error('[CustomerSettings] Failed to save avatar to profile:', error)
      alert('Photo uploaded but could not save to profile: ' + error.message)
      return
    }

    await refreshProfile()
  }

  async function handlePasswordChange(e) {
    e.preventDefault()
    setPwMsg(null)
    if (pwForm.next !== pwForm.confirm) {
      setPwMsg({ type: 'error', text: 'New passwords do not match.' })
      return
    }
    if (pwForm.next.length < 8) {
      setPwMsg({ type: 'error', text: 'New password must be at least 8 characters.' })
      return
    }
    setPwSaving(true)

    // Step 1: Re-authenticate with current password to verify identity
    const { error: reAuthError } = await supabase.auth.signInWithPassword({
      email: user?.email || profile?.email,
      password: pwForm.current,
    })
    if (reAuthError) {
      setPwMsg({ type: 'error', text: 'Current password is incorrect.' })
      setPwSaving(false)
      return
    }

    // Step 2: Update to the new password
    const { error } = await supabase.auth.updateUser({ password: pwForm.next })
    if (error) {
      setPwMsg({ type: 'error', text: error.message })
    } else {
      setPwMsg({ type: 'success', text: 'Password updated successfully.' })
      setPwForm({ current: '', next: '', confirm: '' })
    }
    setPwSaving(false)
  }

  return (
    <PageWrapper
      title="Settings"
      subtitle="Manage your profile and account"
    >
      <div className="space-y-6 max-w-lg">
        {/* Profile info */}
        <Card>
          {/* Avatar — optional for customers */}
          <div className="flex items-center gap-5 mb-6 pb-6 border-b border-neutral-100">
            <AvatarUpload
              userId={profile?.id}
              currentUrl={profile?.avatar_url}
              currentPosition={profile?.avatar_position}
              displayName={profile?.full_name}
              onSave={handleAvatarUpload}
              size="md"
            />
            <div>
              <p className="font-semibold text-neutral-800">{profile?.full_name}</p>
              <p className="text-sm text-neutral-400 mt-0.5">Customer Account</p>
              <p className="text-xs text-neutral-400 mt-1">Optional · JPG, PNG or WebP · max 5 MB</p>
            </div>
          </div>

          <h2 className="text-base font-semibold text-neutral-800 mb-5">Profile Information</h2>
          <form onSubmit={handleSave} className="space-y-5">
            <Input
              id="cs-name"
              label="Full Name"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              required
            />
            <Input
              id="cs-email"
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
            <Input
              id="cs-phone"
              label="Phone Number"
              type="tel"
              value={form.phone_number}
              onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
              placeholder="1234567890"
            />
            <div className="flex items-center gap-3 pt-1">
              <Button type="submit" variant="primary" loading={saving}>
                Save Changes
              </Button>
              {saved && (
                <span className="text-sm text-emerald-600 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Saved
                </span>
              )}
            </div>
          </form>
        </Card>

        {/* Change password */}
        <Card>
          <h2 className="text-base font-semibold text-neutral-800 mb-1">Change Password</h2>
          <p className="text-sm text-neutral-500 mb-5">
            You must enter your current password to set a new one.
          </p>
          <form onSubmit={handlePasswordChange} className="space-y-5">
            <Input
              id="cs-pw-current"
              label="Current Password"
              type="password"
              value={pwForm.current}
              onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })}
              placeholder="••••••••"
              required
            />
            <Input
              id="cs-pw-new"
              label="New Password"
              type="password"
              value={pwForm.next}
              onChange={(e) => setPwForm({ ...pwForm, next: e.target.value })}
              placeholder="Min. 8 characters"
              required
            />
            <Input
              id="cs-pw-confirm"
              label="Confirm New Password"
              type="password"
              value={pwForm.confirm}
              onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
              placeholder="••••••••"
              required
            />
            {pwMsg && (
              <div className={`text-sm rounded-xl px-4 py-3 ${
                pwMsg.type === 'error'
                  ? 'bg-red-50 border border-red-200 text-red-600'
                  : 'bg-emerald-50 border border-emerald-200 text-emerald-700'
              }`}>
                {pwMsg.text}
              </div>
            )}
            <Button type="submit" variant="secondary" loading={pwSaving}>
              Update Password
            </Button>
          </form>
        </Card>
      </div>
    </PageWrapper>
  )
}
