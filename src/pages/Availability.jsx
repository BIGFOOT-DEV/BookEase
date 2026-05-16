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
  is_active: i >= 1 && i <= 5,
}))

const DEFAULT_SETTINGS = { min_advance_hours: 0, max_advance_days: 60, max_bookings_per_day: '' }

export default function Availability() {
  const { profile } = useAuth()
  const [schedule, setSchedule] = useState(DEFAULT_AVAILABILITY)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { if (profile?.id) load() }, [profile])

  async function load() {
    const [{ data: avail }, { data: biz }] = await Promise.all([
      supabase.from('availability').select('*').eq('business_id', profile.id).order('day_of_week'),
      supabase.from('business_settings').select('*').eq('business_id', profile.id).maybeSingle(),
    ])
    if (avail?.length > 0) {
      setSchedule(DEFAULT_AVAILABILITY.map((d) => avail.find((a) => a.day_of_week === d.day_of_week) || d))
    }
    if (biz) {
      setSettings({
        min_advance_hours: biz.min_advance_hours ?? 0,
        max_advance_days: biz.max_advance_days ?? 60,
        max_bookings_per_day: biz.max_bookings_per_day ?? '',
      })
    }
    setLoading(false)
  }

  function toggleDay(i) {
    setSchedule((prev) => prev.map((d) => d.day_of_week === i ? { ...d, is_active: !d.is_active } : d))
  }

  function updateTime(i, field, value) {
    setSchedule((prev) => prev.map((d) => d.day_of_week === i ? { ...d, [field]: value } : d))
  }

  async function handleSave() {
    setSaving(true); setSaved(false)
    const rows = schedule.map((day) => ({
      business_id: profile.id, day_of_week: day.day_of_week,
      start_time: day.start_time, end_time: day.end_time, is_active: day.is_active,
    }))
    const settingsRow = {
      business_id: profile.id,
      min_advance_hours: parseInt(settings.min_advance_hours) || 0,
      max_advance_days: parseInt(settings.max_advance_days) || 60,
      max_bookings_per_day: settings.max_bookings_per_day !== '' ? parseInt(settings.max_bookings_per_day) : null,
      updated_at: new Date().toISOString(),
    }
    const [{ error: availErr }, { error: settingsErr }] = await Promise.all([
      supabase.from('availability').upsert(rows, { onConflict: 'business_id,day_of_week' }),
      supabase.from('business_settings').upsert(settingsRow, { onConflict: 'business_id' }),
    ])
    if (availErr || settingsErr) {
      alert('Failed to save: ' + (availErr?.message || settingsErr?.message))
      setSaving(false); return
    }
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <PageWrapper
      title="Availability"
      subtitle="Set your weekly hours and booking rules"
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
          <Button variant="primary" onClick={handleSave} loading={saving}>Save Schedule</Button>
        </div>
      }
    >
      {loading ? (
        <div className="text-center py-12 text-neutral-400">Loading...</div>
      ) : (
        <div className="space-y-4">
          {/* Weekly schedule */}
          <div className="space-y-3">
            {schedule.map((day) => (
              <Card key={day.day_of_week}>
                <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap">
                  <button
                    type="button" onClick={() => toggleDay(day.day_of_week)}
                    aria-checked={day.is_active} role="switch"
                    className={`relative shrink-0 w-11 h-6 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 transition-colors duration-200 ${day.is_active ? 'bg-primary-500' : 'bg-neutral-200'}`}
                  >
                    <span style={{ transition: 'transform 200ms' }}
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm ${day.is_active ? 'translate-x-5' : 'translate-x-0'}`}
                    />
                  </button>
                  <span className={`w-24 shrink-0 text-sm font-medium ${day.is_active ? 'text-neutral-800' : 'text-neutral-400'}`}>
                    {DAYS[day.day_of_week]}
                  </span>
                  {day.is_active ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <input type="time" value={day.start_time}
                        onChange={(e) => updateTime(day.day_of_week, 'start_time', e.target.value)}
                        className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-neutral-700 focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 outline-none"
                      />
                      <span className="text-neutral-400 text-sm">to</span>
                      <input type="time" value={day.end_time}
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

          {/* Booking Rules */}
          <Card>
            <h2 className="text-base font-semibold text-neutral-800 mb-1">Booking Rules</h2>
            <p className="text-sm text-neutral-500 mb-5">Control how far in advance customers can book and how many per day.</p>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">Minimum advance notice</label>
                <div className="flex items-center gap-2">
                  <input id="min-advance" type="number" min="0" max="168"
                    value={settings.min_advance_hours}
                    onChange={(e) => setSettings({ ...settings, min_advance_hours: e.target.value })}
                    className="w-24 px-3 py-2 bg-white border border-neutral-200 rounded-xl text-sm text-neutral-800 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none"
                  />
                  <span className="text-sm text-neutral-500">hours before appointment</span>
                </div>
                <p className="text-xs text-neutral-400 mt-1">Set to 0 for no minimum.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">Maximum advance notice</label>
                <div className="flex items-center gap-2">
                  <input id="max-advance" type="number" min="1" max="365"
                    value={settings.max_advance_days}
                    onChange={(e) => setSettings({ ...settings, max_advance_days: e.target.value })}
                    className="w-24 px-3 py-2 bg-white border border-neutral-200 rounded-xl text-sm text-neutral-800 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none"
                  />
                  <span className="text-sm text-neutral-500">days in advance</span>
                </div>
                <p className="text-xs text-neutral-400 mt-1">Customers won't see dates beyond this window.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">Maximum bookings per day</label>
                <div className="flex items-center gap-2">
                  <input id="max-per-day" type="number" min="1"
                    value={settings.max_bookings_per_day} placeholder="∞"
                    onChange={(e) => setSettings({ ...settings, max_bookings_per_day: e.target.value })}
                    className="w-24 px-3 py-2 bg-white border border-neutral-200 rounded-xl text-sm text-neutral-800 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none"
                  />
                  <span className="text-sm text-neutral-500">bookings / day</span>
                </div>
                <p className="text-xs text-neutral-400 mt-1">Leave empty for unlimited.</p>
              </div>
            </div>
          </Card>
        </div>
      )}
    </PageWrapper>
  )
}
