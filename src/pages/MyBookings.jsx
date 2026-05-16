import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import PageWrapper from '../components/layout/PageWrapper'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import { formatDate, formatTime } from '../lib/scheduling'

export default function MyBookings() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [bookings, setBookings] = useState([])
  const [filter, setFilter] = useState('upcoming')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user?.id) {
      markMissedBookings().then(() => loadBookings())
    }
  }, [user, filter])

  /**
   * Mark any of the customer's past pending/confirmed bookings as 'missed'.
   */
  async function markMissedBookings() {
    await supabase
      .from('appointments')
      .update({ status: 'missed' })
      .eq('customer_id', user.id)
      .in('status', ['pending', 'confirmed'])
      .lt('end_time', new Date().toISOString())
  }

  async function loadBookings() {
    setLoading(true)
    let query = supabase
      .from('appointments')
      .select('*, services(name, duration_minutes), profiles!appointments_business_id_fkey(full_name, slug)')
      .eq('customer_id', user.id)
      .order('start_time', { ascending: filter === 'upcoming' })

    if (filter === 'upcoming') {
      query = query.gte('start_time', new Date().toISOString()).neq('status', 'cancelled')
    } else if (filter === 'past') {
      query = query.lt('start_time', new Date().toISOString())
    } else if (filter === 'cancelled') {
      query = query.eq('status', 'cancelled')
    }

    const { data } = await query.limit(50)
    setBookings(data || [])
    setLoading(false)
  }

  async function cancelBooking(id) {
    if (!confirm('Cancel this booking?')) return
    await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', id)
    loadBookings()
  }

  const statusBadge = (status) => {
    const map = { pending: 'warning', confirmed: 'success', cancelled: 'error', missed: 'neutral' }
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
      title="My Bookings"
      subtitle="View and manage your appointments"
      action={
        <Link to="/explore">
          <Button variant="primary" size="sm">+ Find a Business</Button>
        </Link>
      }
    >
      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
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

      {loading ? (
        <div className="text-center py-12 text-neutral-400">Loading...</div>
      ) : bookings.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <svg className="w-16 h-16 mx-auto text-neutral-200 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-neutral-600 font-medium">No {filter} bookings</p>
            {filter === 'upcoming' && (
              <>
                <p className="text-sm text-neutral-400 mt-1 mb-5">Find a business and book your first appointment.</p>
                <Link to="/explore">
                  <Button variant="primary">Explore Businesses</Button>
                </Link>
              </>
            )}
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => {
            const isPast = new Date(booking.end_time) < new Date()
            const canCancel = !isPast && booking.status !== 'cancelled'

            return (
              <Card key={booking.id}>
                <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-neutral-800">{booking.services?.name}</h3>
                      {statusBadge(booking.status)}
                    </div>
                    <p className="text-sm text-neutral-500 mb-3">
                      with{' '}
                      <button
                        onClick={() => navigate(`/${booking.profiles?.slug}`)}
                        className="text-primary-600 hover:underline font-medium"
                      >
                        {booking.profiles?.full_name}
                      </button>
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-600">
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4 text-neutral-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        {formatDate(booking.start_time)}
                      </span>
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4 text-neutral-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {formatTime(new Date(booking.start_time))} – {formatTime(new Date(booking.end_time))}
                      </span>
                      <span className="text-neutral-400">
                        {booking.services?.duration_minutes} min
                      </span>
                    </div>
                  </div>
                  {canCancel && (
                    <Button variant="danger" size="sm" onClick={() => cancelBooking(booking.id)} className="shrink-0">
                      Cancel
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </PageWrapper>
  )
}
