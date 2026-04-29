import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { upsertProfile } from '../lib/auth'
import PageWrapper from '../components/layout/PageWrapper'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import AvatarUpload from '../components/ui/AvatarUpload'

export default function Settings() {
  const { profile, user, refreshProfile } = useAuth()
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone_number: '',
    slug: '',
    business_name: '',
    bio: '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Password change state
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState(null)

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name || '',
        email: profile.email || '',
        phone_number: profile.phone_number?.toString() || '',
        slug: profile.slug || '',
        business_name: profile.business_name || '',
        bio: profile.bio || '',
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

    const profileData = {
      id: profile.id,
      full_name: form.full_name,
      email: form.email,
      phone_number: form.phone_number ? parseInt(form.phone_number) : null,
      role: profile.role,
    }

    if (profile?.role === 'business') {
      profileData.slug = form.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-')
      profileData.business_name = form.business_name
      profileData.bio = form.bio || null
    }

    const { error } = await upsertProfile(profileData)

    if (error) {
      alert(error.message)
    } else {
      await refreshProfile()
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }

    setSaving(false)
  }

  // Save avatar URL immediately after upload completes
  async function handleAvatarUpload(publicUrl) {
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', profile.id)

    if (error) {
      console.error('[Settings] Failed to save avatar to profile:', error)
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

    // Step 1: Re-authenticate with the current password to verify identity
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
    const { error: updateError } = await supabase.auth.updateUser({
      password: pwForm.next,
    })

    if (updateError) {
      setPwMsg({ type: 'error', text: updateError.message })
    } else {
      setPwMsg({ type: 'success', text: 'Password updated successfully.' })
      setPwForm({ current: '', next: '', confirm: '' })
    }

    setPwSaving(false)
  }

  return (
    <PageWrapper
      title="Settings"
      subtitle="Manage your profile and business settings"
    >
      <div className="space-y-6 max-w-lg">
        {/* Profile info */}
        <Card>
          {/* Avatar (saves immediately on upload) */}
          <div className="flex items-center gap-5 mb-6 pb-6 border-b border-neutral-100">
            <AvatarUpload
              userId={profile?.id}
              currentUrl={profile?.avatar_url}
              currentPosition={profile?.avatar_position}
              displayName={profile?.role === 'business'
                ? (profile?.business_name || profile?.full_name)
                : profile?.full_name}
              onSave={handleAvatarUpload}
              size="md"
            />
            <div>
              <p className="font-semibold text-neutral-800">{profile?.full_name}</p>
              <p className="text-sm text-neutral-400 capitalize mt-0.5">{profile?.role} Account</p>
              <p className="text-xs text-neutral-400 mt-1">JPG, PNG or WebP · max 5 MB</p>
            </div>
          </div>

          <h2 className="text-base font-semibold text-neutral-800 mb-5">Profile Information</h2>
          <form onSubmit={handleSave} className="space-y-6">
            <Input
              id="settings-name"
              label="Owner's Full Name"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              required
            />

            <Input
              id="settings-email"
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />

            <Input
              id="settings-phone"
              label="Phone Number"
              type="tel"
              value={form.phone_number}
              onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
              placeholder="1234567890"
            />

            {profile?.role === 'business' && (
              <>
                <div>
                  <Input
                    id="settings-business-name"
                    label="Business Name"
                    value={form.business_name}
                    onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                    placeholder="e.g. John's Hair Salon"
                    required
                  />
                  <p className="text-xs text-neutral-400 mt-1.5">
                    This public name is shown to customers in Explore.
                  </p>
                </div>

                {/* Bio / description shown on Explore page */}
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                    Business Description
                    <span className="text-neutral-400 font-normal ml-1">(optional)</span>
                  </label>
                  <textarea
                    id="settings-bio"
                    value={form.bio}
                    onChange={(e) => setForm({ ...form, bio: e.target.value })}
                    placeholder="Tell customers what you offer, your speciality, opening hours…"
                    rows={3}
                    maxLength={200}
                    className="w-full px-4 py-2.5 bg-white border border-neutral-200 rounded-xl
                      text-neutral-800 placeholder-neutral-400 text-sm resize-none
                      focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                  />
                  <p className="text-xs text-neutral-400 mt-1">
                    Shown on the Explore page · {200 - form.bio.length} characters remaining
                  </p>
                </div>

                <div>
                  <Input
                    id="settings-slug"
                    label="Booking URL Slug"
                    value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: e.target.value })}
                    required
                  />
                  <p className="text-xs text-neutral-400 mt-1.5">
                    Your booking page: {window.location.origin}/{form.slug || 'your-slug'}
                  </p>
                </div>
              </>
            )}

            <div className="flex items-center gap-3 pt-1">
              <Button type="submit" variant="primary" loading={saving}>
                Save Changes
              </Button>
              {saved && (
                <span className="text-sm text-emerald-600 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Saved successfully
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
              id="settings-pw-current"
              label="Current Password"
              type="password"
              value={pwForm.current}
              onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })}
              placeholder="••••••••"
              required
            />
            <Input
              id="settings-pw-new"
              label="New Password"
              type="password"
              value={pwForm.next}
              onChange={(e) => setPwForm({ ...pwForm, next: e.target.value })}
              placeholder="Min. 8 characters"
              required
            />
            <Input
              id="settings-pw-confirm"
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
