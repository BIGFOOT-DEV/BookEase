import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { checkPasswordStrength } from '../lib/passwordStrength'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import PasswordStrengthMeter from '../components/ui/PasswordStrengthMeter'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => {
    // Supabase automatically processes the reset token from the URL hash
    // and fires an AUTH_STATE_CHANGE event with event === 'PASSWORD_RECOVERY'.
    // We listen for that to know we have a valid recovery session.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true)
      }
    })

    // Also check if there's already a valid session (page refresh case)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true)
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
    const strength = checkPasswordStrength(password)
    if (!strength.isStrong) {
      setError('Password is too weak. Please meet all the requirements shown below.')
      return
    }

    setLoading(true)

    const { error: err } = await supabase.auth.updateUser({ password })

    if (err) {
      setError(err.message)
    } else {
      setDone(true)
      // Sign out so they log in fresh with the new password
      await supabase.auth.signOut()
      setTimeout(() => navigate('/login'), 3000)
    }

    setLoading(false)
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 to-primary-50/30 px-4">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-neutral-800 mb-2">Password updated!</h1>
          <p className="text-neutral-500 mb-6">Redirecting you to sign in…</p>
          <Link to="/login" className="text-primary-500 font-medium hover:text-primary-600 text-sm">
            Go to Sign In now
          </Link>
        </div>
      </div>
    )
  }

  if (!sessionReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 to-primary-50/30 px-4">
        <div className="w-full max-w-md text-center">
          <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-neutral-500">Verifying your reset link…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 to-primary-50/30 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
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
          <h1 className="text-2xl font-bold text-neutral-800 mt-6">Set a new password</h1>
          <p className="text-neutral-500 mt-1">Choose a strong password for your account</p>
        </div>

        <div className="bg-white rounded-2xl shadow-card border border-neutral-100 p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
                {error}
              </div>
            )}
            <Input
              id="reset-password"
              label="New Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              required
            />
            <PasswordStrengthMeter password={password} />
            <Input
              id="reset-confirm"
              label="Confirm New Password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              required
            />
            <Button type="submit" variant="primary" className="w-full" loading={loading}>
              Update Password
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
