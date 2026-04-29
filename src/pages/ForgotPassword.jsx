import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      // Supabase will append a token to this URL. The user lands here,
      // Supabase's JS library picks up the token from the URL hash and
      // puts the user in a PASSWORD_RECOVERY session automatically.
      redirectTo: `${window.location.origin}/reset-password`,
    })

    if (err) {
      setError(err.message)
    } else {
      setSent(true)
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 to-primary-50/30 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
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
          <h1 className="text-2xl font-bold text-neutral-800 mt-6">Reset your password</h1>
          <p className="text-neutral-500 mt-1">
            Enter your email and we'll send you a reset link
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-card border border-neutral-100 p-8">
          {sent ? (
            <div className="text-center py-4">
              {/* Success illustration */}
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-neutral-800 mb-2">Check your inbox</h2>
              <p className="text-sm text-neutral-500 mb-6">
                We sent a password reset link to <span className="font-medium text-neutral-700">{email}</span>.
                The link expires in 1 hour.
              </p>
              <p className="text-xs text-neutral-400 mb-6">
                Didn't receive it? Check your spam folder or try again.
              </p>
              <button
                onClick={() => setSent(false)}
                className="text-sm text-primary-500 hover:text-primary-600 font-medium"
              >
                Try a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
                  {error}
                </div>
              )}
              <Input
                id="forgot-email"
                label="Email address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
              <Button type="submit" variant="primary" className="w-full" loading={loading}>
                Send Reset Link
              </Button>
            </form>
          )}

          <p className="text-center text-sm text-neutral-500 mt-6">
            <Link to="/login" className="text-primary-500 font-medium hover:text-primary-600">
              ← Back to Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
