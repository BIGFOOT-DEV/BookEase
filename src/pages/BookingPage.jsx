import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'

export default function BookingPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [business, setBusiness] = useState(null)
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    loadBusiness()
  }, [slug])

  async function loadBusiness() {
    const { data: biz } = await supabase
      .from('profiles')
      .select('*')
      .eq('slug', slug)
      .eq('role', 'business')
      .single()

    if (!biz) {
      setNotFound(true)
      setLoading(false)
      return
    }

    setBusiness(biz)

    const { data: svcs } = await supabase
      .from('services')
      .select('*')
      .eq('business_id', biz.id)
      .order('created_at')

    setServices(svcs || [])
    setLoading(false)
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-neutral-800 mb-2">Page not found</h1>
          <p className="text-neutral-500 mb-6">This business booking page doesn't exist.</p>
          <Button variant="primary" onClick={() => navigate('/')}>Go Home</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 to-primary-50/20 px-4 py-12">
      <div className="max-w-2xl mx-auto">

        {/* Back button */}
        <button
          onClick={() => navigate('/explore')}
          className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 mb-8 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Explore
        </button>

        {/* Business header */}
        <div className="text-center mb-10">
          {/* Avatar — real photo or gradient initial */}
          <div className="w-20 h-20 rounded-2xl overflow-hidden mx-auto shadow-card mb-4 border-2 border-white ring-1 ring-neutral-100">
            {business.avatar_url ? (
              <img
                src={business.avatar_url}
                alt={business.business_name || business.full_name}
                className="w-full h-full object-contain bg-neutral-50"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary-500 to-teal-500 flex items-center justify-center">
                <span className="text-2xl font-bold text-white">
                  {(business.business_name || business.full_name)?.[0]?.toUpperCase() || 'B'}
                </span>
              </div>
            )}
          </div>
          <h1 className="text-2xl font-bold text-neutral-800">
            {business.business_name || business.full_name}
          </h1>
          <p className="text-neutral-500 mt-1">Select a service to book an appointment</p>
        </div>

        {/* Own-business block */}
        {profile?.id === business.id ? (
          <Card>
            <div className="text-center py-10">
              <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <h3 className="font-semibold text-neutral-800 mb-1">This is your business</h3>
              <p className="text-sm text-neutral-500 mb-5">
                You can't book your own services. Find another business to book with.
              </p>
              <Button variant="primary" onClick={() => navigate('/explore')}>Explore Other Businesses</Button>
            </div>
          </Card>
        ) : services.length === 0 ? (
          <Card>
            <div className="text-center py-8">
              <p className="text-neutral-500">No services available at the moment.</p>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {services.map((service) => (
              <Card key={service.id} hover onClick={() => navigate(`/${slug}/book?service=${service.id}`)}>
                {/* Service photo banner */}
                {service.image_url && (
                  <div className="-mx-5 -mt-5 mb-4 h-36 overflow-hidden rounded-t-2xl">
                    <img
                      src={service.image_url}
                      alt={service.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-neutral-800">{service.name}</h3>
                    {service.description && (
                      <p className="text-sm text-neutral-500 mt-1">{service.description}</p>
                    )}
                    <div className="flex items-center gap-1 mt-2 text-sm text-primary-600">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {service.duration_minutes} min
                    </div>
                  </div>
                  <svg className="w-5 h-5 text-neutral-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Card>
            ))}
          </div>
        )}

        <p className="text-center text-xs text-neutral-400 mt-8">
          Powered by <span className="font-medium">BookEase</span>
        </p>
      </div>
    </div>
  )
}
