import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getProfile } from '../lib/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
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
        return data
      } catch (e) {
        return null
      }
    }
    return null
  }

  const value = {
    user,
    profile,
    loading,
    refreshProfile,
    isAuthenticated: !!user,
    isBusiness: profile?.role === 'business',
    isCustomer: profile?.role === 'customer',
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
