import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { generateTimeSlots, getNextDays, formatDate, getDayOfWeek } from '../lib/scheduling'
import { isPushSupported, getPushPermissionStatus, subscribeToPush, generateICS, downloadICS } from '../lib/notifications'
import { encryptField } from '../lib/crypto'
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

  const [step, setStep] = useState(1) // 1:date 2:time 3:details 4:confirmed
  const [business, setBusiness] = useState(null)
  const [service, setService] = useState(null)
  const [availability, setAvailability] = useState([])
  const [dates, setDates] = useState([])
  const [selectedDate, setSelectedDate] = useState(null)
  const [slots, setSlots] = useState([])
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [bookedAppointmentId, setBookedAppointmentId] = useState(null)
  const [pushStatus, setPushStatus] = useState('idle')
  const [businessSettings, setBusinessSettings] = useState(null)

  const [form, setForm] = useState({
    customer_name: profile?.full_name || '',
    customer_email: profile?.email || user?.email || '',
    customer_phone: '',
    notes: '',
  })

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
    setStep(2)
  }

  // Step 3 submit: create booking directly (no OTP required)
  async function handleConfirmBooking(e) {
    e.preventDefault()
    if (form.customer_phone && !/^\d+$/.test(form.customer_phone)) {
      setSubmitError('Phone number must contain only digits'); return
    }
    setSubmitting(true)
    setSubmitError('')

    try {
      // Check max bookings per day (client-side guard)
      if (businessSettings?.max_bookings_per_day) {
        const slotDate = new Date(selectedSlot.start)
        const dayStart = new Date(slotDate); dayStart.setHours(0, 0, 0, 0)
        const dayEnd   = new Date(slotDate); dayEnd.setHours(23, 59, 59, 999)
        const { count } = await supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', business.id)
          .neq('status', 'cancelled')
          .gte('start_time', dayStart.toISOString())
          .lte('start_time', dayEnd.toISOString())
        if ((count ?? 0) >= businessSettings.max_bookings_per_day) {
          setSelectedSlot(null); setSlots([]); setStep(1)
          setSubmitError('This day is now fully booked. Please choose another date.')
          return
        }
      }

      const encryptedPhone = form.customer_phone ? await encryptField(form.customer_phone) : null

      // Use the safe_book_appointment RPC (advisory-locked slot conflict check)
      const { data: result, error: rpcErr } = await supabase.rpc('safe_book_appointment', {
        p_business_id:    business.id,
        p_customer_id:    user?.id ?? null,
        p_service_id:     service.id,
        p_start_time:     selectedSlot.start.toISOString(),
        p_end_time:       selectedSlot.end.toISOString(),
        p_customer_name:  form.customer_name,
        p_customer_email: form.customer_email,
        p_customer_phone: encryptedPhone,
        p_notes:          form.notes || null,
      })

      if (rpcErr) {
        setSubmitError('Booking failed. Please try again.')
        console.error('[BookEase] safe_book_appointment error:', rpcErr)
        return
      }

      if (!result?.success) {
        if (result?.error === 'slot_taken') {
          setSelectedSlot(null); setSlots([]); setStep(1)
          setSubmitError('That slot was just taken. Please choose another time.')
        } else {
          setSubmitError('Booking failed. Please try again.')
        }
        return
      }

      const newAppointmentId = result?.appointment_id
      if (newAppointmentId) {
        setBookedAppointmentId(newAppointmentId)

        // Fire-and-forget: call send-notification directly so the
        // confirmation email goes out immediately without needing a
        // DB webhook to be configured on the Supabase dashboard.
        supabase.functions
          .invoke('send-notification', {
            body: { type: 'booking_created', appointment_id: newAppointmentId },
          })
          .then(({ error }) => {
            if (error) console.warn('[BookEase] send-notification:', error.message)
          })
          .catch((err) => console.warn('[BookEase] send-notification fetch:', err))
      }
      setStep(4)
    } catch (err) {
      setSubmitError('Something went wrong: ' + err.message)
      console.error('[BookEase] handleConfirmBooking error:', err)
    } finally {
      setSubmitting(false)
    }
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

        {/* Step indicator — 3 steps now */}
        {step < 4 && (
          <div className="flex items-center gap-2 mb-8 max-w-xs mx-auto">
            {[1, 2, 3].map((s) => (
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

        {/* Step 3: Details + direct confirm */}
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

            <form onSubmit={handleConfirmBooking} className="space-y-4">
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

              {submitError && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
                  {submitError}
                </div>
              )}

              <Button type="submit" variant="coral" className="w-full" size="lg" loading={submitting}>
                Confirm Booking
              </Button>
            </form>
          </Card>
        )}

        {/* Step 4: Confirmation */}
        {step === 4 && (
          <Card>
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-neutral-800 mb-2">Booking Confirmed! 🎉</h2>
              <p className="text-neutral-500 mb-6">
                Your appointment with <strong>{business.full_name}</strong> has been submitted
                and the business will be in touch to confirm. Download the calendar invite below
                so you don't forget.
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
