import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { generateTimeSlots, getNextDays, formatDate, getDayOfWeek } from '../lib/scheduling'
import { isPushSupported, getPushPermissionStatus, subscribeToPush, generateICS, downloadICS } from '../lib/notifications'
import { encryptField } from '../lib/crypto'
import { executeRecaptcha } from '../lib/recaptcha'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Spinner from '../components/ui/Spinner'

export default function BookingFlow() {
  const { slug } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user, profile } = useAuth()

  const serviceId = searchParams.get('service')

  const [step, setStep] = useState(1) // 1:date 2:time 3:details 4:otp 5:confirmed
  const [business, setBusiness] = useState(null)
  const [service, setService] = useState(null)
  const [availability, setAvailability] = useState([])
  const [dates, setDates] = useState([])
  const [selectedDate, setSelectedDate] = useState(null)
  const [slots, setSlots] = useState([])
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [bookedAppointmentId, setBookedAppointmentId] = useState(null)
  const [pushStatus, setPushStatus] = useState('idle')
  const [businessSettings, setBusinessSettings] = useState(null)
  // OTP state
  const [otpSending, setOtpSending] = useState(false)
  const [otpVerifying, setOtpVerifying] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [otpError, setOtpError] = useState('')
  const [otpSecs, setOtpSecs] = useState(0)
  const otpTimer = useRef(null)

  const [form, setForm] = useState({
    customer_name: profile?.full_name || '',
    customer_email: profile?.email || user?.email || '',
    customer_phone: '',
    notes: '',
  })

  function startOtpCountdown() {
    setOtpSecs(60)
    clearInterval(otpTimer.current)
    otpTimer.current = setInterval(() => {
      setOtpSecs((s) => { if (s <= 1) { clearInterval(otpTimer.current); return 0 } return s - 1 })
    }, 1000)
  }
  useEffect(() => () => clearInterval(otpTimer.current), [])

  useEffect(() => {
    loadData()
  }, [slug, serviceId])

  useEffect(() => {
    if (profile) {
      setForm((prev) => ({
        ...prev,
        customer_name: prev.customer_name || profile.full_name || '',
        customer_email: prev.customer_email || profile.email || '',
        customer_phone: prev.customer_phone || (profile.phone_number?.toString() || ''),
      }))
    }
  }, [profile])

  async function loadData() {
    // Get business
    const { data: biz } = await supabase
      .from('profiles')
      .select('*')
      .eq('slug', slug)
      .eq('role', 'business')
      .single()

    if (!biz) { navigate('/'); return }

    // Block owner from booking their own business
    if (profile?.id === biz.id) {
      navigate('/explore')
      return
    }

    setBusiness(biz)

    // Get service
    const { data: svc } = await supabase
      .from('services')
      .select('*')
      .eq('id', serviceId)
      .single()

    if (!svc) { navigate(`/${slug}`); return }
    setService(svc)

    // Get availability
    const { data: avail } = await supabase
      .from('availability')
      .select('*')
      .eq('business_id', biz.id)
      .eq('is_active', true)

    setAvailability(avail || [])

    // Fetch business booking rules
    const { data: bizSettings } = await supabase
      .from('business_settings').select('*').eq('business_id', biz.id).maybeSingle()
    setBusinessSettings(bizSettings)

    const minAdvanceHours = bizSettings?.min_advance_hours ?? 0
    const maxAdvanceDays  = bizSettings?.max_advance_days  ?? 60
    const maxPerDay       = bizSettings?.max_bookings_per_day ?? null

    const activeDays = (avail || []).map((a) => a.day_of_week)
    const now = new Date()
    // min-advance cutoff: no slots that start before now + minAdvanceHours
    const cutoff = new Date(now.getTime() + minAdvanceHours * 3600_000)
    const allDays = getNextDays(now, maxAdvanceDays)

    let available = allDays.filter((d) => {
      if (!activeDays.includes(d.getDay())) return false
      const dayAvailRow = avail.find((a) => a.day_of_week === d.getDay())
      if (!dayAvailRow) return false
      const [closeH, closeM] = dayAvailRow.end_time.split(':').map(Number)
      const dayClose = new Date(d.getFullYear(), d.getMonth(), d.getDate(), closeH, closeM, 0, 0)
      // Service must fit before closing and before the last slot accounts for duration+buffer
      const lastSlotStart = new Date(dayClose.getTime() - (svc.duration_minutes + 5) * 60_000)
      if (lastSlotStart <= cutoff) return false
      return true
    })

    // Apply max bookings per day: filter out fully-booked dates
    if (maxPerDay && available.length > 0) {
      const rangeStart = available[0]
      const rangeEnd   = available[available.length - 1]
      const windowEnd  = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate(), 23, 59, 59)
      const { data: dayBookings } = await supabase
        .from('appointments').select('start_time')
        .eq('business_id', biz.id).neq('status', 'cancelled')
        .gte('start_time', rangeStart.toISOString())
        .lte('start_time', windowEnd.toISOString())
      const countsByDay = {}
      for (const apt of (dayBookings || [])) {
        const key = new Date(apt.start_time).toDateString()
        countsByDay[key] = (countsByDay[key] || 0) + 1
      }
      available = available.filter((d) => (countsByDay[d.toDateString()] || 0) < maxPerDay)
    }

    setDates(available)
    setLoading(false)
  }

  async function selectDate(date) {
    setSelectedDate(date)
    setSelectedSlot(null)
    setSlotsLoading(true)

    // Use LOCAL date components — toISOString() gives UTC date which is
    // off by one day for UTC+ timezones (e.g. Nigeria UTC+1 at night).
    const dateStr = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-')

    const dayAvail = availability.filter((a) => a.day_of_week === date.getDay())

    // Local-time day boundaries
    const dayStart = new Date(date)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(date)
    dayEnd.setHours(23, 59, 59, 999)

    // Use SECURITY DEFINER RPC so we see ALL bookings for the business,
    // not just our own (RLS would otherwise hide other customers' bookings,
    // making taken slots appear available).
    let existingBookings = []
    const { data: rpcBookings, error: rpcErr } = await supabase.rpc(
      'get_business_bookings',
      {
        p_business_id: business.id,
        p_day_start:   dayStart.toISOString(),
        p_day_end:     dayEnd.toISOString(),
      }
    )

    if (rpcErr) {
      // Fallback to direct query if RPC isn't deployed yet
      const { data: fallback } = await supabase
        .from('appointments')
        .select('start_time, end_time')
        .eq('business_id', business.id)
        .gte('start_time', dayStart.toISOString())
        .lte('start_time', dayEnd.toISOString())
        .neq('status', 'cancelled')
      existingBookings = fallback || []
    } else {
      existingBookings = rpcBookings || []
    }

    const timeSlots = generateTimeSlots({
      date: dateStr,
      availability: dayAvail,
      existingBookings,
      durationMinutes: service.duration_minutes,
    })

    setSlots(timeSlots)
    setSlotsLoading(false)

    // ALWAYS advance to step 2 so the customer either sees slots OR the
    // clear "No available slots — pick another date" empty-state.
    // Before this fix, staying on step 1 with a "selected" but unresponsive
    // date button left customers unable to navigate to other dates.
    setStep(2)
  }

  // Step 3 submit: verify reCAPTCHA, send OTP
  async function handleSendOtp(e) {
    e.preventDefault()
    if (form.customer_phone && !/^\d+$/.test(form.customer_phone)) {
      alert('Phone number must contain only digits'); return
    }
    setOtpSending(true); setOtpError('')
    try {
      const token = await executeRecaptcha('book_appointment')
      const { data, error } = await supabase.functions.invoke('send-booking-otp', {
        body: { email: form.customer_email, recaptcha_token: token, business_id: business.id },
      })
      if (error || data?.error) {
        const code = data?.error || 'unknown'
        if (code === 'rate_limited') setOtpError('Too many attempts. Please wait an hour and try again.')
        else if (code === 'captcha_failed') setOtpError('reCAPTCHA check failed. Please refresh and try again.')
        else setOtpError('Could not send verification code. Please try again.')
        return
      }
      setOtpCode(''); setOtpError('')
      startOtpCountdown()
      setStep(4)
    } catch (err) {
      setOtpError('Something went wrong: ' + err.message)
    } finally {
      setOtpSending(false)
    }
  }

  // Step 4 submit: verify OTP + create booking
  async function handleVerifyOtp(e) {
    e.preventDefault()
    if (otpCode.replace(/\D/g, '').length < 6) {
      setOtpError('Please enter the full 6-digit code.'); return
    }
    setOtpVerifying(true); setOtpError('')
    try {
      const encryptedPhone = form.customer_phone ? await encryptField(form.customer_phone) : null
      const { data, error } = await supabase.functions.invoke('verify-booking-otp', {
        body: {
          email: form.customer_email,
          otp: otpCode.replace(/\D/g, ''),
          booking_data: {
            business_id:    business.id,
            customer_id:    user?.id ?? null,
            service_id:     service.id,
            start_time:     selectedSlot.start.toISOString(),
            end_time:       selectedSlot.end.toISOString(),
            customer_name:  form.customer_name,
            customer_email: form.customer_email,
            customer_phone: encryptedPhone,
            notes:          form.notes || null,
          },
        },
      })
      if (error || data?.error) {
        const code = data?.error || 'unknown'
        if (code === 'invalid_code') setOtpError('Incorrect code. Please check your email and try again.')
        else if (code === 'invalid_or_expired') setOtpError('Code expired. Click Resend to get a new one.')
        else if (code === 'slot_taken') {
          setSelectedSlot(null); setSlots([]); setStep(1)
          alert('That slot was just taken. Please choose another time.')
        } else if (code === 'day_fully_booked') {
          setSelectedSlot(null); setSlots([]); setStep(1)
          alert('This day is now fully booked. Please choose another date.')
        } else setOtpError('Verification failed. Please try again.')
        return
      }
      if (data?.appointment_id) setBookedAppointmentId(data.appointment_id)
      setStep(5)
    } catch (err) {
      setOtpError('Something went wrong: ' + err.message)
    } finally {
      setOtpVerifying(false)
    }
  }

  async function handleResendOtp() {
    if (otpSecs > 0) return
    setOtpError('')
    try {
      const token = await executeRecaptcha('resend_otp')
      await supabase.functions.invoke('send-booking-otp', {
        body: { email: form.customer_email, recaptcha_token: token, business_id: business.id },
      })
      setOtpCode('')
      startOtpCountdown()
    } catch { /* silent */ }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 to-primary-50/20 px-4 py-12">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <button
            onClick={() => navigate(`/${slug}`)}
            className="text-sm text-neutral-500 hover:text-neutral-700 mb-4 inline-flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to services
          </button>
          <h1 className="text-xl font-bold text-neutral-800">{service?.name}</h1>
          <p className="text-sm text-neutral-500">{service?.duration_minutes} min · {business?.full_name}</p>
        </div>

        {/* Step indicator */}
        {step < 5 && (
          <div className="flex items-center gap-2 mb-8 max-w-xs mx-auto">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full transition-all ${
                  s <= step ? 'bg-primary-500' : 'bg-neutral-200'
                }`}
              />
            ))}
          </div>
        )}

        {/* Step 1: Date selection */}
        {step === 1 && (
          <Card>
            <h2 className="font-semibold text-neutral-800 mb-4">Select a date</h2>

            {dates.length === 0 ? (
              /* Business hasn't configured any active days, or all days are off */
              <div className="text-center py-10">
                <svg className="w-10 h-10 mx-auto text-neutral-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-neutral-600 font-medium text-sm">No available dates</p>
                <p className="text-xs text-neutral-400 mt-1">
                  This business hasn't published their schedule yet.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-80 overflow-y-auto">
                {dates.map((date) => {
                  const isToday    = date.toDateString() === new Date().toDateString()
                  const isSelected = selectedDate && date.toDateString() === selectedDate.toDateString()
                  return (
                    <button
                      key={date.toISOString()}
                      onClick={() => selectDate(date)}
                      disabled={slotsLoading}
                      className={`p-3 rounded-xl text-center transition-all border ${
                        isSelected
                          ? 'bg-primary-500 text-white border-primary-500 shadow-soft'
                          : 'bg-white text-neutral-700 border-neutral-200 hover:border-primary-300 hover:bg-primary-50'
                      } disabled:opacity-60 disabled:cursor-wait`}
                    >
                      <div className="text-xs font-medium opacity-70">
                        {date.toLocaleDateString('en-US', { weekday: 'short' })}
                      </div>
                      <div className="text-lg font-bold">{date.getDate()}</div>
                      <div className="text-xs opacity-70">
                        {date.toLocaleDateString('en-US', { month: 'short' })}
                      </div>
                      {isToday && (
                        <div className="text-[10px] font-medium mt-0.5 text-primary-300">Today</div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </Card>
        )}

        {/* Step 2: Time selection */}
        {step === 2 && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-neutral-800">
                Select a time · {formatDate(selectedDate)}
              </h2>
              <button
                onClick={() => setStep(1)}
                className="text-sm text-primary-500 hover:text-primary-600"
              >
                Change date
              </button>
            </div>

            {slotsLoading ? (
              <Spinner className="py-8" />
            ) : slots.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-neutral-500">No available slots on this date</p>
                <Button variant="secondary" size="sm" className="mt-3" onClick={() => setStep(1)}>
                  Pick another date
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-80 overflow-y-auto">
                {slots.map((slot, i) => (
                  <button
                    key={i}
                    onClick={() => { setSelectedSlot(slot); setStep(3) }}
                    className={`p-3 rounded-xl text-sm font-medium transition-all border ${
                      selectedSlot === slot
                        ? 'bg-primary-500 text-white border-primary-500'
                        : 'bg-white text-neutral-700 border-neutral-200 hover:border-primary-300 hover:bg-primary-50'
                    }`}
                  >
                    {slot.label}
                  </button>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Step 3: Details */}
        {step === 3 && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-neutral-800">Your details</h2>
              <button
                onClick={() => setStep(2)}
                className="text-sm text-primary-500 hover:text-primary-600"
              >
                Change time
              </button>
            </div>

            {/* Summary */}
            <div className="bg-neutral-50 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-3 text-sm">
                <div className="text-neutral-500">
                  <p><span className="font-medium text-neutral-700">Date:</span> {formatDate(selectedDate)}</p>
                  <p><span className="font-medium text-neutral-700">Time:</span> {selectedSlot?.label}</p>
                  <p><span className="font-medium text-neutral-700">Duration:</span> {service.duration_minutes} min</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSendOtp} className="space-y-4">
              <Input
                id="booking-name"
                label="Your Name"
                value={form.customer_name}
                onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                required
              />
              <Input
                id="booking-email"
                label="Email"
                type="email"
                value={form.customer_email}
                onChange={(e) => setForm({ ...form, customer_email: e.target.value })}
                required
              />
              <Input
                id="booking-phone"
                label="Phone Number"
                type="tel"
                value={form.customer_phone}
                onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
                placeholder="1234567890"
              />
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-neutral-700">Notes (optional)</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Anything we should know?"
                  rows={3}
                  className="w-full px-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-neutral-800 placeholder-neutral-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                />
              </div>
              <p className="text-xs text-neutral-400">A 6-digit code will be sent to verify your email.</p>
              <Button type="submit" variant="coral" className="w-full" size="lg" loading={otpSending}>
                Send Verification Code
              </Button>
            </form>
          </Card>
        )}

        {/* Step 4: OTP verification */}
        {step === 4 && (
          <Card>
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="font-semibold text-neutral-800">Check your email</h2>
              <p className="text-sm text-neutral-500 mt-1">
                We sent a 6-digit code to <strong>{form.customer_email}</strong>
              </p>
            </div>
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <Input
                id="otp-code"
                label="Verification Code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                required
              />
              {otpError && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
                  {otpError}
                </div>
              )}
              <Button type="submit" variant="primary" className="w-full" loading={otpVerifying}
                disabled={otpCode.length < 6}>
                Verify &amp; Confirm Booking
              </Button>
            </form>
            <div className="text-center mt-4 space-y-2">
              {otpSecs > 0 ? (
                <p className="text-sm text-neutral-400">Resend code in <span className="font-semibold">{otpSecs}s</span></p>
              ) : (
                <button type="button" onClick={handleResendOtp}
                  className="text-sm text-primary-500 hover:text-primary-600 font-medium">
                  Resend code
                </button>
              )}
              <div>
                <button type="button" onClick={() => { setStep(3); setOtpCode(''); setOtpError('') }}
                  className="text-xs text-neutral-400 hover:text-neutral-600">
                  ← Change details
                </button>
              </div>
            </div>
          </Card>
        )}

        {/* Step 5: Confirmation */}
        {step === 5 && (
          <Card>
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-neutral-800 mb-2">Booking Confirmed! 🎉</h2>
              <p className="text-neutral-500 mb-6">
                Your appointment with {business.full_name} has been submitted.
                A confirmation email with a calendar invite has been sent to {form.customer_email}.
              </p>

              <div className="bg-neutral-50 rounded-xl p-5 mb-6 text-left max-w-sm mx-auto">
                <p className="text-sm text-neutral-600">
                  <span className="font-medium">Service:</span> {service.name}
                </p>
                <p className="text-sm text-neutral-600 mt-1">
                  <span className="font-medium">Date:</span> {formatDate(selectedDate)}
                </p>
                <p className="text-sm text-neutral-600 mt-1">
                  <span className="font-medium">Time:</span> {selectedSlot?.label}
                </p>
              </div>

              {/* Calendar download */}
              <button
                onClick={() => {
                  const ics = generateICS({
                    uid: bookedAppointmentId ?? crypto.randomUUID(),
                    summary: `${service.name} with ${business.full_name}`,
                    description: `Booked via BookEase.`,
                    startTime: selectedSlot.start,
                    endTime: selectedSlot.end,
                    businessName: business.full_name,
                  })
                  downloadICS(ics, `${service.name.replace(/\s+/g, '-')}.ics`)
                }}
                className="inline-flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium mb-6 underline underline-offset-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Add to Calendar (.ics)
              </button>

              {/* Push notification opt-in */}
              {isPushSupported() && getPushPermissionStatus() !== 'denied' && pushStatus === 'idle' && (
                <div className="bg-primary-50 border border-primary-100 rounded-xl p-4 mb-6 text-left max-w-sm mx-auto">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">🔔</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-primary-800 mb-1">Get reminded automatically</p>
                      <p className="text-xs text-primary-600 mb-3">Enable push notifications to receive a 24-hour and 30-minute reminder before your appointment.</p>
                      <Button
                        variant="primary"
                        size="sm"
                        loading={pushStatus === 'loading'}
                        onClick={async () => {
                          setPushStatus('loading')
                          const session = (await supabase.auth.getSession()).data.session
                          const result = await subscribeToPush(
                            session?.access_token ?? null,
                            form.customer_email,
                          )
                          setPushStatus(result.success ? 'done' : 'denied')
                        }}
                      >
                        Enable Reminders
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              {pushStatus === 'done' && (
                <p className="text-sm text-emerald-600 font-medium mb-6">✅ Reminders enabled! We'll notify you before your appointment.</p>
              )}
              {pushStatus === 'denied' && (
                <p className="text-sm text-neutral-400 mb-6">Push notifications blocked. You'll still receive email reminders.</p>
              )}

              <div className="flex gap-3 justify-center">
                <Button variant="primary" onClick={() => navigate(`/${slug}`)}>
                  Book Another
                </Button>
                {user && (
                  <Button variant="secondary" onClick={() => navigate('/my-bookings')}>
                    View My Bookings
                  </Button>
                )}
              </div>
            </div>
          </Card>
        )}

        <p className="text-center text-xs text-neutral-400 mt-8">
          Powered by <span className="font-medium">BookEase</span>
        </p>
      </div>
    </div>
  )
}
