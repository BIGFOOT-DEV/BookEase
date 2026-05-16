import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import {
  isPushSupported,
  getPushPermissionStatus,
  subscribeToPush,
  unsubscribeFromPush,
} from '../lib/notifications'
import PageWrapper from '../components/layout/PageWrapper'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'

function Toggle({ checked, onChange, label, description, id }) {
  return (
    <div className="flex items-start justify-between gap-4 py-4 border-b border-neutral-100 last:border-0">
      <div className="flex-1">
        <label htmlFor={id} className="text-sm font-medium text-neutral-800 cursor-pointer">
          {label}
        </label>
        {description && (
          <p className="text-xs text-neutral-500 mt-0.5">{description}</p>
        )}
      </div>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
          checked ? 'bg-primary-500' : 'bg-neutral-200'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

export default function NotificationSettings() {
  const { user, profile } = useAuth()
  const [prefs, setPrefs] = useState({
    email_enabled: true,
    push_enabled: true,
    reminder_24h: true,
    reminder_30min: true,
    digest_enabled: true,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [pushState, setPushState] = useState('unknown') // unknown | unsupported | default | granted | denied

  const isBusiness = profile?.role === 'business'

  useEffect(() => {
    if (user?.id) {
      loadPrefs()
      checkPushState()
    }
  }, [user])

  async function checkPushState() {
    if (!isPushSupported()) {
      setPushState('unsupported')
      return
    }
    setPushState(getPushPermissionStatus())
  }

  async function loadPrefs() {
    setLoading(true)
    const { data } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (data) {
      setPrefs({
        email_enabled: data.email_enabled ?? true,
        push_enabled: data.push_enabled ?? true,
        reminder_24h: data.reminder_24h ?? true,
        reminder_30min: data.reminder_30min ?? true,
        digest_enabled: data.digest_enabled ?? true,
      })
    }
    setLoading(false)
  }

  async function savePrefs() {
    setSaving(true)
    await supabase
      .from('notification_preferences')
      .upsert({ user_id: user.id, ...prefs, updated_at: new Date().toISOString() })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  async function handlePushToggle(enable) {
    if (enable) {
      if (pushState === 'unsupported') return
      const session = (await supabase.auth.getSession()).data.session
      const result = await subscribeToPush(session?.access_token ?? null, null)
      if (result.success) {
        setPushState('granted')
        setPrefs((p) => ({ ...p, push_enabled: true }))
      } else {
        alert('Could not enable push notifications. Your browser may have blocked them.')
      }
    } else {
      await unsubscribeFromPush()
      setPrefs((p) => ({ ...p, push_enabled: false }))
    }
  }

  if (loading) {
    return (
      <PageWrapper title="Notification Settings" subtitle="Manage how you receive alerts">
        <div className="text-center py-12 text-neutral-400">Loading...</div>
      </PageWrapper>
    )
  }

  return (
    <PageWrapper
      title="Notification Settings"
      subtitle="Control how BookEase keeps you informed"
    >
      <div className="max-w-xl space-y-6">

        {/* Email Notifications */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center text-lg">
              📧
            </div>
            <div>
              <h2 className="font-semibold text-neutral-800">Email Notifications</h2>
              <p className="text-xs text-neutral-500">Delivered to your registered email address</p>
            </div>
          </div>

          <Toggle
            id="email-all"
            label="All email notifications"
            description="Master toggle for all email alerts"
            checked={prefs.email_enabled}
            onChange={(v) => setPrefs((p) => ({ ...p, email_enabled: v }))}
          />
          <Toggle
            id="reminder-24h"
            label="24-hour reminder"
            description="Email reminder the day before your appointment"
            checked={prefs.reminder_24h && prefs.email_enabled}
            onChange={(v) => setPrefs((p) => ({ ...p, reminder_24h: v }))}
          />
          {isBusiness && (
            <Toggle
              id="daily-digest"
              label="Daily schedule digest"
              description="Receive tomorrow's appointments at 8 AM every morning"
              checked={prefs.digest_enabled && prefs.email_enabled}
              onChange={(v) => setPrefs((p) => ({ ...p, digest_enabled: v }))}
            />
          )}
        </Card>

        {/* Push Notifications */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-purple-100 rounded-lg flex items-center justify-center text-lg">
              🔔
            </div>
            <div>
              <h2 className="font-semibold text-neutral-800">Push Notifications</h2>
              <p className="text-xs text-neutral-500">Browser alerts — works even when the tab is closed</p>
            </div>
          </div>

          {pushState === 'unsupported' ? (
            <div className="bg-neutral-50 rounded-xl p-4 text-sm text-neutral-500">
              Your browser doesn't support push notifications.
            </div>
          ) : pushState === 'denied' ? (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
              <p className="text-sm font-medium text-amber-800 mb-1">Push notifications are blocked</p>
              <p className="text-xs text-amber-600">
                To enable them, click the lock/info icon in your browser's address bar and allow notifications for this site.
              </p>
            </div>
          ) : (
            <>
              <Toggle
                id="push-all"
                label="Browser push notifications"
                description={pushState === 'granted' ? '✅ Permission granted' : 'Click to request permission'}
                checked={prefs.push_enabled && pushState === 'granted'}
                onChange={handlePushToggle}
              />
              <Toggle
                id="reminder-30min"
                label="30-minute reminder"
                description="Push alert 30 minutes before your appointment"
                checked={prefs.reminder_30min && prefs.push_enabled && pushState === 'granted'}
                onChange={(v) => setPrefs((p) => ({ ...p, reminder_30min: v }))}
              />
            </>
          )}
        </Card>

        {/* What you always receive */}
        <Card>
          <h3 className="font-semibold text-neutral-800 mb-3">Always delivered</h3>
          <p className="text-sm text-neutral-500 mb-3">These notifications cannot be disabled — they're essential for your bookings.</p>
          <ul className="space-y-2 text-sm text-neutral-600">
            {[
              'Booking confirmation + .ics calendar invite',
              'Appointment confirmed or cancelled by business',
              'Missed appointment follow-up',
              isBusiness && 'New booking requests',
            ].filter(Boolean).map((item) => (
              <li key={item} className="flex items-center gap-2">
                <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </Card>

        {/* Save button */}
        <div className="flex items-center gap-3">
          <Button
            id="save-notification-prefs"
            variant="primary"
            onClick={savePrefs}
            loading={saving}
          >
            Save Preferences
          </Button>
          {saved && (
            <span className="text-sm text-emerald-600 font-medium animate-fade-in">
              ✅ Saved!
            </span>
          )}
        </div>
      </div>
    </PageWrapper>
  )
}
