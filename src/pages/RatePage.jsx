import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function RatePage() {
  const { appointmentId } = useParams()
  const [searchParams] = useSearchParams()
  const initialStars = parseInt(searchParams.get('stars') || '0', 10)

  const [stars, setStars] = useState(initialStars || 0)
  const [hoveredStar, setHoveredStar] = useState(0)
  const [comment, setComment] = useState('')
  const [status, setStatus] = useState('idle') // idle | loading | success | error | already_rated
  const [appointment, setAppointment] = useState(null)

  useEffect(() => {
    loadAppointment()
  }, [appointmentId])

  async function loadAppointment() {
    const { data: apt } = await supabase
      .from('appointments')
      .select('*, services(name), business:profiles!appointments_business_id_fkey(full_name)')
      .eq('id', appointmentId)
      .single()

    setAppointment(apt)

    // Check if already rated
    const { data: existing } = await supabase
      .from('appointment_ratings')
      .select('id')
      .eq('appointment_id', appointmentId)
      .single()

    if (existing) setStatus('already_rated')
  }

  async function handleSubmit() {
    if (stars < 1) return
    setStatus('loading')

    const { error } = await supabase.from('appointment_ratings').insert({
      appointment_id: appointmentId,
      rating: stars,
      comment: comment.trim() || null,
    })

    if (error) {
      if (error.code === '23505') {
        setStatus('already_rated') // unique constraint
      } else {
        setStatus('error')
      }
    } else {
      setStatus('success')
    }
  }

  const businessName = appointment?.business?.full_name ?? 'the business'
  const serviceName = appointment?.services?.name ?? 'your appointment'

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-neutral-50 to-primary-50/20 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-soft p-10 max-w-md w-full text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="text-2xl font-bold text-neutral-800 mb-2">Thank you!</h1>
          <p className="text-neutral-500">
            Your {stars}-star rating for {businessName} has been submitted. It helps other customers make better choices.
          </p>
        </div>
      </div>
    )
  }

  if (status === 'already_rated') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-neutral-50 to-primary-50/20 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-soft p-10 max-w-md w-full text-center">
          <div className="text-6xl mb-4">⭐</div>
          <h1 className="text-2xl font-bold text-neutral-800 mb-2">Already rated</h1>
          <p className="text-neutral-500">
            You've already submitted a rating for this appointment. Thank you!
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 to-primary-50/20 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-soft p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">⭐</div>
          <h1 className="text-2xl font-bold text-neutral-800">Rate your experience</h1>
          <p className="text-neutral-500 text-sm mt-1">
            How was your {serviceName} with {businessName}?
          </p>
        </div>

        {/* Star selector */}
        <div className="flex justify-center gap-2 mb-6">
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              id={`star-${s}`}
              onMouseEnter={() => setHoveredStar(s)}
              onMouseLeave={() => setHoveredStar(0)}
              onClick={() => setStars(s)}
              className="text-4xl transition-transform hover:scale-110 focus:outline-none"
            >
              {s <= (hoveredStar || stars) ? '⭐' : '☆'}
            </button>
          ))}
        </div>

        {stars > 0 && (
          <p className="text-center text-sm font-medium text-primary-600 mb-4">
            {['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][stars]} · {stars} star{stars !== 1 ? 's' : ''}
          </p>
        )}

        {/* Optional comment */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-neutral-700 mb-1.5">
            Leave a comment <span className="text-neutral-400 font-normal">(optional)</span>
          </label>
          <textarea
            id="rating-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What did you like? What could be improved?"
            rows={3}
            className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-800 placeholder-neutral-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all resize-none text-sm"
          />
        </div>

        <button
          id="submit-rating"
          disabled={stars < 1 || status === 'loading'}
          onClick={handleSubmit}
          className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
            stars > 0
              ? 'bg-primary-500 text-white hover:bg-primary-600 active:scale-[0.98]'
              : 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
          } ${status === 'loading' ? 'opacity-70' : ''}`}
        >
          {status === 'loading' ? 'Submitting...' : 'Submit Rating'}
        </button>

        {status === 'error' && (
          <p className="text-sm text-red-500 text-center mt-3">
            Something went wrong. Please try again.
          </p>
        )}
      </div>
    </div>
  )
}
