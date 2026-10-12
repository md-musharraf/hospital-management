import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router'
import { Cookie } from 'lucide-react'
import { PageLoader, Toasts } from './ui.tsx'
import { consent } from './api.ts'
import Landing from './pages/Landing.tsx'

const Legal = lazy(() => import('./pages/Legal.tsx'))
const PatientLogin = lazy(() => import('./pages/PatientLogin.tsx'))
const Portal = lazy(() => import('./pages/Portal.tsx'))
const Track = lazy(() => import('./pages/Track.tsx'))
const Display = lazy(() => import('./pages/Display.tsx'))
const StaffLogin = lazy(() => import('./pages/StaffLogin.tsx'))
const Shell = lazy(() => import('./staff/Shell.tsx'))
const Dashboard = lazy(() => import('./staff/Dashboard.tsx'))
const Desk = lazy(() => import('./staff/Desk.tsx'))
const FrontDesk = lazy(() => import('./staff/FrontDesk.tsx'))
const Billing = lazy(() => import('./staff/Billing.tsx'))
const Bills = lazy(() => import('./staff/Bills.tsx'))
const Patients = lazy(() => import('./staff/Patients.tsx'))
const Lab = lazy(() => import('./staff/Lab.tsx'))
const Pharmacy = lazy(() => import('./staff/Pharmacy.tsx'))
const Expenses = lazy(() => import('./staff/Expenses.tsx'))
const Catalog = lazy(() => import('./staff/Catalog.tsx'))
const Team = lazy(() => import('./staff/Team.tsx'))
const Settings = lazy(() => import('./staff/Settings.tsx'))

function ScrollTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (!hash) window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname, hash])
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollTop />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/privacy" element={<Legal doc="privacy" />} />
          <Route path="/cookies" element={<Legal doc="cookies" />} />
          <Route path="/terms" element={<Legal doc="terms" />} />
          <Route path="/login" element={<PatientLogin />} />
          <Route path="/my" element={<Portal />} />
          <Route path="/track/:code" element={<Track />} />
          <Route path="/display" element={<Display />} />
          <Route path="/staff/login" element={<StaffLogin />} />
          <Route path="/staff" element={<Shell />}>
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="desk" element={<Desk />} />
            <Route path="front-desk" element={<FrontDesk />} />
            <Route path="billing" element={<Billing />} />
            <Route path="bills" element={<Bills />} />
            <Route path="patients" element={<Patients />} />
            <Route path="patients/:id" element={<Patients />} />
            <Route path="lab" element={<Lab />} />
            <Route path="pharmacy" element={<Pharmacy />} />
            <Route path="expenses" element={<Expenses />} />
            <Route path="catalog" element={<Catalog />} />
            <Route path="team" element={<Team />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <CookieBanner />
      <Toasts />
    </BrowserRouter>
  )
}

function NotFound() {
  return (
    <div className="page-loader">
      <div className="empty">
        <h1 style={{ fontSize: 64 }}>404</h1>
        <p>This page does not exist.</p>
        <Link className="btn btn-primary" to="/">
          Go home
        </Link>
      </div>
    </div>
  )
}

function CookieBanner() {
  const { pathname } = useLocation()
  const [choice, setChoice] = useState(consent)
  if (choice || pathname.startsWith('/staff') || pathname === '/display') return null
  const decide = (v: 'all' | 'essential') => {
    try {
      localStorage.setItem('cookie_consent', v)
      if (v === 'essential') localStorage.removeItem('bot_sid')
    } catch {
      /* private mode */
    }
    setChoice(v)
  }
  return (
    <div className="cookie" role="dialog" aria-label="Cookie preferences">
      <h4>
        <Cookie /> Your privacy, your choice
      </h4>
      <p>
        We use essential cookies to keep you signed in and secure. With your OK we also remember your chat on this device. No ads, no trackers.{' '}
        <Link to="/cookies">Cookie policy</Link>
      </p>
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn btn-primary btn-sm" onClick={() => decide('all')}>
          Accept all
        </button>
        <button className="btn btn-sm" onClick={() => decide('essential')}>
          Essential only
        </button>
      </div>
    </div>
  )
}

