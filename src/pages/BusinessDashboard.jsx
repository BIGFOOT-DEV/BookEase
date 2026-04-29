import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import PageWrapper from '../components/layout/PageWrapper'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import { formatDate, formatTime } from '../lib/scheduling'

export default function BusinessDashboard() {
  const { profile } = useAuth()
  const [stats, setStats] = useState({ today: 0, upcoming: 0, total: 0 })
  const [upcomingAppointments, setUpcomingAppointments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile?.id) loadDashboard()
  }, [profile])

  async function loadDashboard() {
    const now = new Date().toISOString()
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)

    // Upcoming appointments (next 7)
    const { data: upcoming } = await supabase
      .from('appointments')
      .select('*, services(name, duration_minutes)')
      .eq('business_id', profile.id)
      .gte('start_time', now)
      .neq('status', 'cancelled')
      .order('start_time')
      .limit(7)

    setUpcomingAppointments(upcoming || [])

    // Stats
    const { count: todayCount } = await supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', profile.id)
      .gte('start_time', todayStart.toISOString())
      .lte('start_time', todayEnd.toISOString())
      .neq('status', 'cancelled')

    const { count: upcomingCount } = await supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', profile.id)
      .gte('start_time', now)
      .neq('status', 'cancelled')

    const { count: totalCount } = await supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', profile.id)

    setStats({
      today: todayCount || 0,
      upcoming: upcomingCount || 0,
      total: totalCount || 0,
    })

    setLoading(false)
  }

  const statusBadge = (status) => {
    const map = {
      pending: 'warning',
      confirmed: 'success',
      cancelled: 'error',
    }
    return <Badge variant={map[status] || 'neutral'}>{status}</Badge>
  }

  return (
    <PageWrapper
      title={`Welcome back, ${profile?.full_name?.split(' ')[0] || 'there'}!`}
      subtitle="Here's what's happening with your bookings"
    >
      {/* Stats */}
      <div className="grid sm:grid-cols-3 gap-5 mb-8">
        {[
          { label: 'Today', value: stats.today, color: 'text-primary-600', bg: 'bg-primary-50' },
          { label: 'Upcoming', value: stats.upcoming, color: 'text-teal-600', bg: 'bg-teal-50' },
          { label: 'Total Bookings', value: stats.total, color: 'text-neutral-600', bg: 'bg-neutral-50' },
        ].map((stat) => (
          <Card key={stat.label}>
            <p className="text-sm font-medium text-neutral-500">{stat.label}</p>
            <p className={`text-3xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </Card>
        ))}
      </div>

      {/* Booking link */}
      {profile?.slug && (
        <Card className="mb-8 !bg-gradient-to-r from-primary-50 to-teal-50 !border-primary-100">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm font-medium text-neutral-600">Your booking link</p>
              <p className="text-primary-600 font-mono text-sm mt-1">
                {window.location.origin}/{profile.slug}
              </p>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(`${window.location.origin}/${profile.slug}`)}
              className="px-4 py-2 bg-white text-primary-600 text-sm font-medium rounded-xl border border-primary-200 hover:bg-primary-50 transition-colors"
            >
              Copy Link
            </button>
          </div>
        </Card>
      )}

      {/* Upcoming appointments */}
      <div>
        <h2 className="text-lg font-semibold text-neutral-800 mb-4">Upcoming Appointments</h2>
        {loading ? (
          <div className="text-center py-12 text-neutral-400">Loading...</div>
        ) : upcomingAppointments.length === 0 ? (
          <Card>
            <div className="text-center py-8">
              <svg className="w-12 h-12 mx-auto text-neutral-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-neutral-500">No upcoming appointments</p>
              <p className="text-sm text-neutral-400 mt-1">Share your booking link to start getting booked</p>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {upcomingAppointments.map((apt) => (
              <Card key={apt.id} hover>
                <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center text-primary-600 font-semibold text-sm shrink-0">
                      {apt.customer_name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-neutral-800 truncate">{apt.customer_name}</p>
                      <p className="text-sm text-neutral-500">
                        {apt.services?.name} · {apt.services?.duration_minutes} min
                      </p>
                    </div>
                  </div>
                  <div className="text-left sm:text-right shrink-0">
                    <p className="text-sm font-medium text-neutral-700">
                      {formatDate(apt.start_time)}
                    </p>
                    <p className="text-sm text-neutral-500">
                      {formatTime(new Date(apt.start_time))}
                    </p>
                    <div className="mt-1">{statusBadge(apt.status)}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PageWrapper>
  )
}
