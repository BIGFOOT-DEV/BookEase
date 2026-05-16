import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getProfile } from '../lib/auth'

const AuthContext = createContext(null)

// ── Role cache ────────────────────────────────────────────────────────────────
// Persists the user's role to localStorage so the correct dashboard layout is
// rendered immediately on page load/return — before the async profile fetch
// resolves. Without this, business users briefly see the customer dashboard.
const ROLE_CACHE_KEY = 'bookease_role_cache'

function readRoleCache() {
  try {
    const raw = localStorage.getItem(ROLE_CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function writeRoleCache(profile) {
  if (!profile) return
  try {
    localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify({ role: profile.role, id: profile.id }))
  } catch { /* ignore */ }
}

function clearRoleCache() {
  try { localStorage.removeItem(ROLE_CACHE_KEY) } catch { /* ignore */ }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // Read cached role immediately so route guards don't flash the wrong layout
  const cachedRole = readRoleCache()
  const [cachedIsBusiness] = useState(cachedRole?.role === 'business')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        // No session — clear stale cache
        clearRoleCache()
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null)
        if (session?.user) {
          if (event === 'SIGNED_IN') setLoading(true)
          await loadProfile(session.user.id)
        } else {
          clearRoleCache()
          setProfile(null)
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(userId) {
    try {
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Profile load timeout')), 5000)
      )
      const { data } = await Promise.race([getProfile(userId), timeout])
      setProfile(data)
      writeRoleCache(data)
    } catch (e) {
      setProfile(null)
    }
    setLoading(false)
  }

  async function refreshProfile(overrideUserId) {
    const uid = overrideUserId || user?.id
    if (uid) {
      try {
        const { data } = await getProfile(uid)
        setProfile(data)
        writeRoleCache(data)
        return data
      } catch (e) {
        return null
      }
    }
    return null
  }

  // Use the real profile role once loaded; fall back to cache while loading
  const resolvedRole = profile?.role ?? (loading ? cachedRole?.role : null)

  const value = {
    user,
    profile,
    loading,
    refreshProfile,
    isAuthenticated: !!user,
    isBusiness: resolvedRole === 'business',
    isCustomer: resolvedRole === 'customer',
    hasProfile: !!profile,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
