import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Navbar from '../components/layout/Navbar'
import Card from '../components/ui/Card'
import Spinner from '../components/ui/Spinner'

export default function Explore() {
  const navigate = useNavigate()
  const [businesses, setBusinesses] = useState([])
  const [filtered, setFiltered] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadBusinesses() }, [])

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(businesses)
    } else {
      const q = search.toLowerCase()
      setFiltered(
        businesses.filter((b) => {
          const name = (b.business_name || b.full_name || '').toLowerCase()
          return name.includes(q) || b.slug?.toLowerCase().includes(q)
        })
      )
    }
  }, [search, businesses])

  async function loadBusinesses() {
    // Try with bio; fall back without it if the column doesn't exist yet
    let { data, error } = await supabase
      .from('profiles')
      .select('id, business_name, full_name, slug, avatar_url, avatar_position, bio')
      .eq('role', 'business')
      .order('business_name')

    if (error) {
      console.warn('[Explore] Falling back (bio column may be missing):', error.message)
      ;({ data } = await supabase
        .from('profiles')
        .select('id, business_name, full_name, slug, avatar_url, avatar_position')
        .eq('role', 'business')
        .order('business_name'))
    }

    setBusinesses(data || [])
    setFiltered(data || [])
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <Navbar />

      <div className="max-w-5xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-neutral-800">Find a Business</h1>
          <p className="text-neutral-500 mt-1">
            Browse and book appointments with businesses on BookEase
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-8">
          <svg
            className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            id="explore-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by business name…"
            className="w-full pl-12 pr-4 py-3.5 bg-white border border-neutral-200 rounded-2xl
              text-neutral-800 placeholder-neutral-400 focus:border-primary-500
              focus:ring-2 focus:ring-primary-500/20 outline-none transition-all shadow-sm text-sm"
          />
        </div>

        {/* Results */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner size="lg" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <div className="text-center py-16">
              <svg className="w-14 h-14 mx-auto text-neutral-200 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <p className="text-neutral-600 font-medium">
                {search ? 'No businesses match your search' : 'No businesses available yet'}
              </p>
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="text-sm text-primary-500 mt-2 hover:text-primary-600"
                >
                  Clear search
                </button>
              )}
            </div>
          </Card>
        ) : (
          <>
            <p className="text-sm text-neutral-400 mb-4">
              {filtered.length} business{filtered.length !== 1 ? 'es' : ''} found
            </p>

            {/* ── Business cards: image on top, details below ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map((biz) => {
                const displayName = biz.business_name || biz.full_name || 'Business'
                const position    = biz.avatar_position || 'center'

                return (
                  <div
                    key={biz.id}
                    onClick={() => navigate(`/${biz.slug}`)}
                    className="bg-white rounded-2xl shadow-card border border-neutral-100
                      overflow-hidden cursor-pointer group
                      hover:shadow-elevated hover:-translate-y-1 transition-all duration-300"
                  >
                    {/* ── Top: full business image, no cropping ── */}
                    <div className="relative h-44 overflow-hidden bg-neutral-100">
                      {biz.avatar_url ? (
                        <img
                          src={biz.avatar_url}
                          alt={displayName}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-primary-400 to-teal-500
                          flex items-center justify-center">
                          <span className="text-6xl font-bold text-white/60 select-none">
                            {displayName[0]?.toUpperCase() || 'B'}
                          </span>
                        </div>
                      )}
                      {/* Subtle gradient at bottom only when no image */}
                      {!biz.avatar_url && (
                        <div className="absolute inset-x-0 bottom-0 h-12
                          bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                      )}
                    </div>

                    {/* ── Bottom: business info ── */}
                    <div className="p-5">
                      <h3 className="font-semibold text-neutral-800 truncate text-base
                        group-hover:text-primary-600 transition-colors">
                        {displayName}
                      </h3>
                      <p className="text-xs text-neutral-400 mt-0.5 truncate">/{biz.slug}</p>

                      {/* Business description */}
                      {biz.bio && (
                        <p className="text-xs text-neutral-500 mt-2 leading-relaxed line-clamp-2">
                          {biz.bio}
                        </p>
                      )}

                      <div className="mt-4 pt-4 border-t border-neutral-100
                        flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium
                          text-primary-600 bg-primary-50 px-3 py-1.5 rounded-full
                          group-hover:bg-primary-100 transition-colors">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          Book Appointment
                        </span>
                        <svg className="w-4 h-4 text-neutral-300 group-hover:text-primary-400 transition-colors"
                          fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
