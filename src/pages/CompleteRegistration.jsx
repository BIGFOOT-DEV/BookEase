import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { upsertProfile } from '../lib/auth'
import { useAuth } from '../context/AuthContext'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'

function Logo() {
  return (
    <Link to="/" className="inline-flex items-center gap-2">
      <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-teal-500 rounded-xl flex items-center justify-center shadow-soft">
        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
      <span className="text-2xl font-bold text-neutral-800">
        Book<span className="text-primary-500">Ease</span>
      </span>
    </Link>
  )
}

/**
 * This page handles the redirect that happens after a user clicks the
 * magic-link verification email during registration.
 *
 * Flow:
 *  1. User clicks link in email → Supabase redirects to /complete-registration
 *  2. Supabase JS client detects the auth token in the URL hash → fires SIGNED_IN
 *  3. We read the profile metadata stored in user_metadata during signInWithOtp
 *  4. User sets a password → updateUser({ password })
 *  5. Profile row is created in the database → navigate to dashboard
 */
export default function CompleteRegistration() {
  const navigate = useNavigate()
  const { refreshProfile } = useAuth()

  const [status, setStatus] = useState('waiting') // waiting | ready | error | done
  const [userData, setUserData] = useState(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // The Supabase client automatically parses the URL hash that contains the
    // access_token from the magic link. It fires an auth state change event.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session?.user) {
          setUserData(session.user)
          setStatus('ready')
        }
      }
    )

    // Also check if a session already exists (e.g. page refresh after link click)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUserData(session.user)
        setStatus('ready')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setSaving(true)
    try {
      // 1. Set the user's password (they currently have a passwordless account)
      const { error: pwErr } = await supabase.auth.updateUser({ password })
      if (pwErr) {
        setError('Could not set password: ' + pwErr.message)
        setSaving(false)
        return
      }

      // 2. Read the profile metadata embedded by Register during signInWithOtp
      const meta = userData?.user_metadata || {}
      const profileData = {
        id: userData.id,
        role: meta.role || 'customer',
        full_name: meta.full_name || '',
        email: userData.email,
        phone_number: meta.phone_number || null,
      }
      if (meta.business_slug) {
        profileData.slug = meta.business_slug
      }

      // 3. Create the profile row
      const { error: profileErr } = await upsertProfile(profileData)
      if (profileErr) {
        setError('Profile creation failed: ' + profileErr.message)
        setSaving(false)
        return
      }

      // 4. Navigate to the right dashboard
      setStatus('done')
      const profile = await refreshProfile(userData.id)
      if (profile?.role === 'business') {
        navigate('/dashboard')
      } else {
        navigate('/my-bookings')
      }
    } catch (err) {
      setError('Something went wrong: ' + err.message)
      setSaving(false)
    }
  }

  // ── Waiting for magic-link session ────────────────────────────────────────
  if (status === 'waiting') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 to-primary-50/30 px-4">
        <div className="text-center">
          <div className="w-14 h-14 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin mx-auto mb-5" />
          <h2 className="text-lg font-semibold text-neutral-800 mb-1">Verifying your email…</h2>
          <p className="text-sm text-neutral-400">Please wait while we confirm your identity.</p>
        </div>
      </div>
    )
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  if (status === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 to-primary-50/30 px-4">
        <div className="text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-neutral-800">Account created!</h1>
          <p className="text-neutral-500 mt-1">Taking you to your dashboard…</p>
        </div>
      </div>
    )
  }

  // ── Ready: set password ───────────────────────────────────────────────────
  const meta = userData?.user_metadata || {}
  const roleLabel = meta.role === 'business' ? 'Business' : 'Customer'
  const roleColor = meta.role === 'business' ? 'text-primary-600 bg-primary-50' : 'text-teal-600 bg-teal-50'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 to-primary-50/30 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Logo />

          {/* Success verification banner */}
          <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium px-4 py-2 rounded-full mt-6 mb-3">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Email verified successfully
          </div>

          <h1 className="text-2xl font-bold text-neutral-800">Set your password</h1>
          <p className="text-neutral-500 mt-1 text-sm">One last step to complete your account</p>
        </div>

        <div className="bg-white rounded-2xl shadow-card border border-neutral-100 p-8">
          {/* Account summary */}
          <div className="flex items-center gap-3 p-4 bg-neutral-50 rounded-2xl mb-6">
            <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-primary-600">
                {(meta.full_name || userData?.email || 'U')[0].toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-neutral-800 truncate">{meta.full_name || 'New User'}</p>
              <p className="text-xs text-neutral-400 truncate">{userData?.email}</p>
            </div>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${roleColor}`}>
              {roleLabel}
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            <Input
              id="complete-password"
              label="Create a Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              required
            />
            <Input
              id="complete-confirm"
              label="Confirm Password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              required
            />

            {/* Password strength hints */}
            <div className="space-y-1.5">
              {[
                { ok: password.length >= 8, text: 'At least 8 characters' },
                { ok: /[A-Z]/.test(password), text: 'One uppercase letter' },
                { ok: /[0-9]/.test(password), text: 'One number' },
              ].map((hint) => (
                <div key={hint.text} className="flex items-center gap-2">
                  <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 ${hint.ok ? 'bg-emerald-100' : 'bg-neutral-100'}`}>
                    {hint.ok && (
                      <svg className="w-2.5 h-2.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className={`text-xs ${hint.ok ? 'text-emerald-600' : 'text-neutral-400'}`}>
                    {hint.text}
                  </span>
                </div>
              ))}
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full mt-2"
              loading={saving}
            >
              Create Account
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
