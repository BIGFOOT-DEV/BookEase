import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import PageWrapper from '../components/layout/PageWrapper'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const DEFAULT_AVAILABILITY = DAYS.map((_, i) => ({
  day_of_week: i,
  start_time: '09:00',
  end_time: '17:00',
  is_active: i >= 1 && i <= 5, // Mon-Fri active by default
}))

export default function Availability() {
  const { profile } = useAuth()
  const [schedule, setSchedule] = useState(DEFAULT_AVAILABILITY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (profile?.id) loadAvailability()
  }, [profile])

  async function loadAvailability() {
    const { data } = await supabase
      .from('availability')
      .select('*')
      .eq('business_id', profile.id)
      .order('day_of_week')

    if (data && data.length > 0) {
      const merged = DEFAULT_AVAILABILITY.map((defaultDay) => {
        const found = data.find((d) => d.day_of_week === defaultDay.day_of_week)
        return found || defaultDay
      })
      setSchedule(merged)
    }
    setLoading(false)
  }

  function toggleDay(dayIndex) {
    setSchedule((prev) =>
      prev.map((d) =>
        d.day_of_week === dayIndex ? { ...d, is_active: !d.is_active } : d
      )
    )
  }

  function updateTime(dayIndex, field, value) {
    setSchedule((prev) =>
      prev.map((d) =>
        d.day_of_week === dayIndex ? { ...d, [field]: value } : d
      )
    )
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)

    const rows = schedule.map((day) => ({
      business_id: profile.id,
      day_of_week: day.day_of_week,
      start_time:  day.start_time,
      end_time:    day.end_time,
      is_active:   day.is_active,
    }))

    // Upsert (update if row for that day already exists, insert if not).
    // This is atomic and avoids the race-condition window that delete+insert
    // created, where a customer loading between DELETE and INSERT would see
    // zero available dates on the booking page.
    const { error } = await supabase
      .from('availability')
      .upsert(rows, { onConflict: 'business_id,day_of_week' })

    if (error) {
      console.error('[Availability] save error:', error)
      alert('Failed to save schedule: ' + error.message)
      setSaving(false)
      return
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <PageWrapper
      title="Availability"
      subtitle="Set your weekly working hours"
      action={
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-sm text-emerald-600 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Saved
            </span>
          )}
          <Button variant="primary" onClick={handleSave} loading={saving}>
            Save Schedule
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className="text-center py-12 text-neutral-400">Loading...</div>
      ) : (
        <div className="space-y-3">
          {schedule.map((day) => (
            <Card key={day.day_of_week}>
              <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap">
                {/* Toggle — outline-none prevents focus ring from overlapping day label */}
                <button
                  type="button"
                  onClick={() => toggleDay(day.day_of_week)}
                  aria-checked={day.is_active}
                  role="switch"
                  className={`relative shrink-0 w-11 h-6 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 transition-colors duration-200 ${
                    day.is_active ? 'bg-primary-500' : 'bg-neutral-200'
                  }`}
                >
                  {/* Use inline style for transform to avoid 'transition: all' from index.css bleeding in */}
                  <span
                    style={{ transition: 'transform 200ms' }}
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm ${
                      day.is_active ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>

                {/* Day name */}
                <span className={`w-24 shrink-0 text-sm font-medium ${day.is_active ? 'text-neutral-800' : 'text-neutral-400'}`}>
                  {DAYS[day.day_of_week]}
                </span>

                {/* Time inputs */}
                {day.is_active ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="time"
                      value={day.start_time}
                      onChange={(e) => updateTime(day.day_of_week, 'start_time', e.target.value)}
                      className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-neutral-700 focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 outline-none"
                    />
                    <span className="text-neutral-400 text-sm">to</span>
                    <input
                      type="time"
                      value={day.end_time}
                      onChange={(e) => updateTime(day.day_of_week, 'end_time', e.target.value)}
                      className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-neutral-700 focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 outline-none"
                    />
                  </div>
                ) : (
                  <span className="text-sm text-neutral-400">Closed</span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageWrapper>
  )
}
