import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { signOut } from '../../lib/auth'
import Button from '../ui/Button'

export default function Navbar() {
  const { user, profile, isAuthenticated, isBusiness } = useAuth()
  const navigate = useNavigate()
  const [drawerOpen, setDrawerOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    setDrawerOpen(false)
    navigate('/')
  }

  function close() { setDrawerOpen(false) }

  return (
    <>
      <nav className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-neutral-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-teal-500 rounded-xl flex items-center justify-center shadow-soft group-hover:shadow-card transition-shadow">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <span className="text-xl font-bold text-neutral-800">
                Book<span className="text-primary-500">Ease</span>
              </span>
            </Link>

            {/* Desktop right side */}
            <div className="hidden sm:flex items-center gap-3">
              {isAuthenticated ? (
                <>
                  {!isBusiness && (
                    <Link
                      to="/explore"
                      className="text-sm font-medium text-neutral-600 hover:text-neutral-800 transition-colors px-3 py-2 rounded-lg hover:bg-neutral-50"
                    >
                      Explore
                    </Link>
                  )}
                  <Link
                    to={isBusiness ? '/dashboard' : '/my-bookings'}
                    className="text-sm font-medium text-neutral-600 hover:text-neutral-800 transition-colors px-3 py-2 rounded-lg hover:bg-neutral-50"
                  >
                    {isBusiness ? 'Dashboard' : 'My Bookings'}
                  </Link>
                  <div className="flex items-center gap-3 pl-3 border-l border-neutral-200">
                    <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                      <span className="text-sm font-semibold text-primary-600">
                        {profile?.full_name?.[0]?.toUpperCase() || 'U'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="px-3 py-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-800 hover:bg-neutral-100 rounded-xl transition-all cursor-pointer"
                    >
                      Sign Out
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <Link to="/login">
                    <Button variant="ghost" size="sm">Log In</Button>
                  </Link>
                  <Link to="/register">
                    <Button variant="primary" size="sm">Get Started</Button>
                  </Link>
                </>
              )}
            </div>

            {/* Mobile hamburger button */}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="sm:hidden p-2 rounded-xl text-neutral-600 hover:bg-neutral-100 transition-colors"
              aria-label="Open menu"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {/* ── Right-slide drawer overlay ── */}
      {/* Backdrop */}
      <div
        onClick={close}
        className={`sm:hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
          drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Drawer panel — slides in from the right */}
      <div
        className={`sm:hidden fixed top-0 right-0 z-50 h-full w-[75vw] max-w-xs bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${
          drawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
          <Link to="/" onClick={close} className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-primary-500 to-teal-500 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="text-lg font-bold text-neutral-800">Book<span className="text-primary-500">Ease</span></span>
          </Link>
          <button
            type="button"
            onClick={close}
            className="p-2 rounded-xl text-neutral-500 hover:bg-neutral-100 transition-colors"
            aria-label="Close menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Drawer body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
          {isAuthenticated ? (
            <>
              {/* User info */}
              <div className="flex items-center gap-3 px-3 py-3 mb-3 bg-primary-50 rounded-2xl">
                <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                  <span className="text-sm font-semibold text-primary-600">
                    {profile?.full_name?.[0]?.toUpperCase() || 'U'}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-neutral-800 truncate">{profile?.full_name || 'User'}</p>
                  <p className="text-xs text-neutral-400 truncate">{user?.email}</p>
                </div>
              </div>

              {!isBusiness && (
                <Link
                  to="/explore"
                  onClick={close}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-neutral-600 hover:bg-neutral-50 hover:text-neutral-800 transition-colors"
                >
                  <svg className="w-5 h-5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Explore
                </Link>
              )}

              <Link
                to={isBusiness ? '/dashboard' : '/my-bookings'}
                onClick={close}
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-neutral-600 hover:bg-neutral-50 hover:text-neutral-800 transition-colors"
              >
                <svg className="w-5 h-5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {isBusiness ? 'Dashboard' : 'My Bookings'}
              </Link>
              {/* Settings — show for both roles */}
              <Link
                to={isBusiness ? '/dashboard/settings' : '/my-bookings/settings'}
                onClick={close}
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-neutral-600 hover:bg-neutral-50 hover:text-neutral-800 transition-colors"
              >
                <svg className="w-5 h-5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
              </Link>
            </>
          ) : (
            <>
              <Link
                to="/login"
                onClick={close}
                className="flex items-center px-3 py-3 rounded-xl text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors"
              >
                Log In
              </Link>
              <Link
                to="/register"
                onClick={close}
                className="flex items-center px-3 py-3 rounded-xl text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 transition-colors"
              >
                Get Started
              </Link>
            </>
          )}
        </div>

        {/* Sign out at the bottom */}
        {isAuthenticated && (
          <div className="px-4 py-4 border-t border-neutral-100">
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </button>
          </div>
        )}
      </div>
    </>
  )
}
