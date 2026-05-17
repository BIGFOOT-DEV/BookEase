import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Navbar from './components/layout/Navbar'
import Sidebar from './components/layout/Sidebar'
import CustomerTabBar from './components/layout/CustomerTabBar'
import Spinner from './components/ui/Spinner'

// Pages
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import Explore from './pages/Explore'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import CompleteRegistration from './pages/CompleteRegistration'
import BusinessDashboard from './pages/BusinessDashboard'
import Services from './pages/Services'
import Availability from './pages/Availability'
import Appointments from './pages/Appointments'
import Settings from './pages/Settings'
import BookingPage from './pages/BookingPage'
import BookingFlow from './pages/BookingFlow'
import MyBookings from './pages/MyBookings'
import CustomerSettings from './pages/CustomerSettings'
import NotificationSettings from './pages/NotificationSettings'
import RatePage from './pages/RatePage'

/**
 * Layout wrapper for business dashboard pages (with sidebar)
 */
function DashboardLayout() {
  const { loading, isAuthenticated, isBusiness, hasProfile } = useAuth()

  // Always wait for both auth AND profile to resolve before making routing decisions
  if (loading || (isAuthenticated && !hasProfile)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!isAuthenticated) return <Navigate to="/login" />

  // Profile is loaded — now safe to check role
  if (!isBusiness) return <Navigate to="/my-bookings" />

  return (
    <div className="min-h-screen bg-neutral-50">
      <Navbar />
      <div className="flex">
        <Sidebar />
        {/* On mobile, sidebar is a fixed bottom bar — content spans full width.
            On md+, sidebar is on the left so content sits beside it. */}
        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

/**
 * Layout wrapper for customer pages (with bottom tab bar on mobile)
 */
function CustomerLayout() {
  const { loading, isAuthenticated, isBusiness, hasProfile } = useAuth()

  // Always wait for both auth AND profile to resolve before making routing decisions
  if (loading || (isAuthenticated && !hasProfile)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!isAuthenticated) return <Navigate to="/login" />

  // Profile is loaded — now safe to check role
  if (isBusiness) return <Navigate to="/dashboard" />

  return (
    <div className="min-h-screen bg-neutral-50">
      <Navbar />
      <div className="flex">
        {/* CustomerTabBar renders a sidebar on md+ and a bottom tab bar on mobile */}
        <CustomerTabBar />
        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<><Navbar /><Landing /></>} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/explore" element={<Explore />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/complete-registration" element={<CompleteRegistration />} />

      {/* Business dashboard (protected, business only) */}
      <Route element={<DashboardLayout />}>
        <Route path="/dashboard" element={<BusinessDashboard />} />
        <Route path="/dashboard/services" element={<Services />} />
        <Route path="/dashboard/availability" element={<Availability />} />
        <Route path="/dashboard/appointments" element={<Appointments />} />
        <Route path="/dashboard/settings" element={<Settings />} />
        <Route path="/dashboard/notifications" element={<NotificationSettings />} />
      </Route>

      {/* Customer dashboard (protected, customer only) */}
      <Route element={<CustomerLayout />}>
        <Route path="/my-bookings" element={<MyBookings />} />
        <Route path="/my-bookings/settings" element={<CustomerSettings />} />
        <Route path="/my-bookings/notifications" element={<NotificationSettings />} />
      </Route>

      {/* Public booking routes (/:slug) */}
      <Route path="/:slug" element={<BookingPage />} />
      <Route path="/:slug/book" element={<BookingFlow />} />
      <Route path="/rate/:appointmentId" element={<RatePage />} />
    </Routes>
  )
}
