import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { upsertProfile } from '../lib/auth'
import { useAuth } from '../context/AuthContext'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'

// ── Logo ────────────────────────────────────────────────────────────────────

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

// ── 6-box OTP input ─────────────────────────────────────────────────────────

function OtpInput({ value, onChange, disabled }) {
  const inputs = useRef([])
  const digits = value.split('')

  function handleChange(i, char) {
    const cleaned = char.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[i] = cleaned
    onChange(next.join(''))
    if (cleaned && i < 7) inputs.current[i + 1]?.focus()
  }

  function handleKeyDown(i, e) {
    if (e.key === 'Backspace') {
      if (digits[i]) {
        const next = [...digits]
        next[i] = ''
        onChange(next.join(''))
      } else if (i > 0) {
        inputs.current[i - 1]?.focus()
      }
    }
  }

  function handlePaste(e) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 8)
    onChange(pasted.padEnd(8, ' ').slice(0, 8).trimEnd())
    inputs.current[Math.min(pasted.length, 5)]?.focus()
  }

  return (
    <div className="flex gap-2 justify-center" onPaste={handlePaste}>
      {Array.from({ length: 8 }).map((_, i) => (
        <input
          key={i}
          ref={(el) => (inputs.current[i] = el)}
          id={`otp-digit-${i}`}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[i] || ''}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          className={`w-11 h-14 text-center text-xl font-bold border-2 rounded-xl outline-none transition-all duration-150
            ${digits[i]
              ? 'border-primary-500 bg-primary-50 text-primary-700'
              : 'border-neutral-200 bg-white text-neutral-800'
            }
            focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20
            disabled:opacity-50 disabled:cursor-not-allowed`}
        />
      ))}
    </div>
  )
}

// ── 60-second countdown ──────────────────────────────────────────────────────

function useCountdown(from = 60) {
  const [secs, setSecs] = useState(from)
  const interval = useRef(null)

  function reset() {
    setSecs(from)
    clearInterval(interval.current)
    interval.current = setInterval(() => {
      setSecs((s) => {
        if (s <= 1) { clearInterval(interval.current); return 0 }
        return s - 1
      })
    }, 1000)
  }

  useEffect(() => () => clearInterval(interval.current), [])

  return { secs, reset }
}

// ── Step progress bar ────────────────────────────────────────────────────────

function StepBar({ total, current }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
            i < current ? 'bg-primary-500' : 'bg-neutral-200'
          }`}
        />
      ))}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function Register() {
  const navigate = useNavigate()
  const { refreshProfile } = useAuth()

  const [step, setStep] = useState(1)   // 1=role  2=details  3=otp
  const [role, setRole] = useState('')
  const [fullName, setFullName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [businessSlug, setBusinessSlug] = useState('')

  const [otp, setOtp] = useState('')
  const [otpError, setOtpError] = useState('')
  const [otpLoading, setOtpLoading] = useState(false)

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { secs, reset: resetCountdown } = useCountdown(60)

  // ── Step 2 → send OTP ────────────────────────────────────────────────────

  async function handleDetailsSubmit(e) {
    e.preventDefault()
    setError('')

    if (phone && !/^\d+$/.test(phone)) {
      setError('Phone number must contain only digits')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    try {
      // Sends OTP to the user's email using the "Magic Link" template.
      // Since you've updated the template to show {{ .Token }}, this now
      // delivers a 6-digit code instead of a clickable link.
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      })

      if (otpErr) { setError(otpErr.message); return }

      setStep(3)
      resetCountdown()
    } catch (err) {
      setError('Something went wrong: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Step 3 → verify OTP → set password → create profile → navigate ───────

  async function handleOtpSubmit(e) {
    e.preventDefault()
    setOtpError('')

    const code = otp.replace(/\D/g, '')
    if (code.length < 8) {
      setOtpError('Please enter the complete 8-digit code')
      return
    }

    setOtpLoading(true)
    try {
      // Verify the 6-digit OTP — creates an active session
      const { data, error: verifyErr } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'email',
      })

      if (verifyErr || !data?.user) {
        setOtpError('Incorrect or expired code. Please check your email and try again.')
        setOtp('')
        return
      }

      // Set the password on the now-verified account
      const { error: pwErr } = await supabase.auth.updateUser({ password })
      if (pwErr) { setOtpError('Could not set password: ' + pwErr.message); return }

      // Create the profile row
      const profileData = {
        id: data.user.id,
        role,
        full_name: fullName,
        email,
        phone_number: phone ? parseInt(phone, 10) : null,
      }
      if (role === 'business') {
        profileData.slug = businessSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-')
        profileData.business_name = businessName
      }

      const { error: profileErr } = await upsertProfile(profileData)
      if (profileErr) { setOtpError('Profile creation failed: ' + profileErr.message); return }

      // Navigate to the right dashboard
      const updatedProfile = await refreshProfile(data.user.id)
      if (updatedProfile?.role === 'business') {
        navigate('/dashboard')
      } else {
        navigate('/my-bookings')
      }
    } catch (err) {
      setOtpError('Something went wrong: ' + err.message)
    } finally {
      setOtpLoading(false)
    }
  }

  // ── Resend OTP ────────────────────────────────────────────────────────────

  async function handleResend() {
    if (secs > 0) return
    await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    })
    resetCountdown()
    setOtp('')
    setOtpError('')
  }

  // ── Step 3: OTP entry screen ──────────────────────────────────────────────

  if (step === 3) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 to-primary-50/30 px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Logo />
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mt-6 mb-3">
              <svg className="w-8 h-8 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-neutral-800">Verify your email</h1>
            <p className="text-neutral-500 mt-1.5 text-sm">
              We sent an 8-digit code to
            </p>
            <p className="font-semibold text-neutral-800 mt-0.5">{email}</p>
          </div>

          <div className="bg-white rounded-2xl shadow-card border border-neutral-100 p-8">
            <StepBar total={3} current={3} />

            <form onSubmit={handleOtpSubmit} className="space-y-6">
              <div>
                <p className="text-sm text-neutral-500 text-center mb-4">
                  Enter the 8-digit code from your email
                </p>
                <OtpInput value={otp} onChange={setOtp} disabled={otpLoading} />
              </div>

              {otpError && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3 text-center">
                  {otpError}
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                className="w-full"
                loading={otpLoading}
                disabled={otp.replace(/\D/g, '').length < 8}
              >
                Verify &amp; Create Account
              </Button>
            </form>

            <div className="text-center mt-5">
              {secs > 0 ? (
                <p className="text-sm text-neutral-400">
                  Resend code in <span className="font-semibold text-neutral-600">{secs}s</span>
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  className="text-sm text-primary-500 hover:text-primary-600 font-medium"
                >
                  Resend code
                </button>
              )}
            </div>

            <div className="text-center mt-4">
              <button
                type="button"
                onClick={() => { setStep(2); setOtp(''); setOtpError('') }}
                className="text-sm text-neutral-400 hover:text-neutral-600"
              >
                ← Use a different email
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Steps 1 & 2 ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 to-primary-50/30 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Logo />
          <h1 className="text-2xl font-bold text-neutral-800 mt-6">Create your account</h1>
          <p className="text-neutral-500 mt-1">
            {step === 1 ? 'How will you use BookEase?' : 'Fill in your details'}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-card border border-neutral-100 p-8">
          <StepBar total={3} current={step} />

          {/* Step 1 — Role */}
          {step === 1 && (
            <div className="space-y-4">
              <button
                onClick={() => { setRole('business'); setStep(2) }}
                className="w-full p-5 rounded-2xl border-2 border-neutral-200 hover:border-primary-400 hover:bg-primary-50/50 transition-all text-left group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 bg-primary-100 rounded-xl flex items-center justify-center text-primary-600 group-hover:bg-primary-200 transition-colors shrink-0">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-neutral-800">I'm a business</h3>
                    <p className="text-sm text-neutral-500 mt-0.5">I want to manage services and receive bookings</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => { setRole('customer'); setStep(2) }}
                className="w-full p-5 rounded-2xl border-2 border-neutral-200 hover:border-teal-400 hover:bg-teal-50/50 transition-all text-left group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 bg-teal-100 rounded-xl flex items-center justify-center text-teal-600 group-hover:bg-teal-200 transition-colors shrink-0">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-neutral-800">I'm a customer</h3>
                    <p className="text-sm text-neutral-500 mt-0.5">I want to book appointments with businesses</p>
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* Step 2 — Details */}
          {step === 2 && (
            <form onSubmit={handleDetailsSubmit} className="space-y-5">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
                  {error}
                </div>
              )}

              <Input id="register-name" label="Owner's Full Name" value={fullName}
                onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" required />

              {role === 'business' && (
                <>
                  <Input id="register-business-name" label="Business Name" value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="e.g. John's Hair Salon"
                    required
                  />
                  <p className="-mt-3 text-xs text-neutral-400">
                    This is the public name shown to customers in Explore.
                  </p>
                </>
              )}

              <Input id="register-email" label="Email" type="email" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
              <Input id="register-phone" label="Phone Number (optional)" type="tel" value={phone}
                onChange={(e) => setPhone(e.target.value)} placeholder="1234567890" />
              <Input id="register-password" label="Password" type="password" value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" required />

              {role === 'business' && (
                <Input id="register-slug" label="Business URL slug" value={businessSlug}
                  onChange={(e) => setBusinessSlug(e.target.value)} placeholder="my-business" required />
              )}

              <p className="text-xs text-neutral-400">
                An 8-digit verification code will be sent to your email.
              </p>

              <div className="flex gap-3">
                <Button type="button" variant="secondary" onClick={() => { setStep(1); setError('') }} className="w-full">
                  Back
                </Button>
                <Button type="submit" variant="primary" className="w-full" loading={loading}>
                  Send Code
                </Button>
              </div>
            </form>
          )}

          <p className="text-center text-sm text-neutral-500 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-primary-500 font-medium hover:text-primary-600">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
