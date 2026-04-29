import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import PageWrapper from '../components/layout/PageWrapper'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import { formatDate, formatTime } from '../lib/scheduling'

export default function Appointments() {
  const { profile } = useAuth()
  const [appointments, setAppointments] = useState([])
  const [filter, setFilter] = useState('upcoming')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile?.id) loadAppointments()
  }, [profile, filter])

  async function loadAppointments() {
    setLoading(true)
    let query = supabase
      .from('appointments')
      .select('*, services(name, duration_minutes)')
      .eq('business_id', profile.id)
      .order('start_time', { ascending: filter === 'upcoming' })

    if (filter === 'upcoming') {
      query = query.gte('start_time', new Date().toISOString()).neq('status', 'cancelled')
    } else if (filter === 'past') {
      query = query.lt('start_time', new Date().toISOString())
    } else if (filter === 'cancelled') {
      query = query.eq('status', 'cancelled')
    }

    const { data } = await query.limit(50)
    setAppointments(data || [])
    setLoading(false)
  }

  async function updateStatus(id, status) {
    await supabase.from('appointments').update({ status }).eq('id', id)
    loadAppointments()
  }

  const statusBadge = (status) => {
    const map = { pending: 'warning', confirmed: 'success', cancelled: 'error' }
    return <Badge variant={map[status] || 'neutral'}>{status}</Badge>
  }

  const filters = [
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'past', label: 'Past' },
    { key: 'cancelled', label: 'Cancelled' },
    { key: 'all', label: 'All' },
  ]

  return (
    <PageWrapper
      title="Appointments"
      subtitle="View and manage all your bookings"
    >
      {/* Filters */}
      <div className="flex gap-2 mb-6">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 text-sm font-medium rounded-xl transition-all ${
              filter === f.key
                ? 'bg-primary-500 text-white shadow-soft'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-neutral-400">Loading...</div>
      ) : appointments.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <svg className="w-12 h-12 mx-auto text-neutral-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-neutral-500">No {filter} appointments</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {appointments.map((apt) => (
            <Card key={apt.id}>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 bg-primary-100 rounded-full flex items-center justify-center text-primary-600 font-semibold">
                    {apt.customer_name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <p className="font-medium text-neutral-800">{apt.customer_name}</p>
                    <p className="text-sm text-neutral-500">{apt.customer_email}</p>
                    {apt.customer_phone && (
                      <p className="text-sm text-neutral-400">📞 {apt.customer_phone}</p>
                    )}
                  </div>
                </div>

                <div className="text-sm">
                  <p className="font-medium text-neutral-700">{apt.services?.name}</p>
                  <p className="text-neutral-500">
                    {formatDate(apt.start_time)} · {formatTime(new Date(apt.start_time))} – {formatTime(new Date(apt.end_time))}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {statusBadge(apt.status)}
                  {apt.status === 'pending' && (
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="primary" onClick={() => updateStatus(apt.id, 'confirmed')}>
                        Confirm
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => updateStatus(apt.id, 'cancelled')}>
                        Cancel
                      </Button>
                    </div>
                  )}
                  {apt.status === 'confirmed' && (
                    <Button size="sm" variant="danger" onClick={() => updateStatus(apt.id, 'cancelled')}>
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
              {apt.notes && (
                <p className="text-sm text-neutral-500 mt-3 pt-3 border-t border-neutral-100">
                  <span className="font-medium text-neutral-600">Note:</span> {apt.notes}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </PageWrapper>
  )
}
