import { useEffect } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, Cookie } from 'lucide-react'
import { useApi } from '../api.ts'
import { Brand, Footer, type Site } from './Landing.tsx'

const UPDATED = '12 October 2026'

export function PublicTop({ s }: { s?: Record<string, string> }) {
  return (
    <div className="wrap public-top">
      <Brand s={s} />
      <Link to="/" className="btn btn-ghost btn-sm">
        <ArrowLeft /> Home
      </Link>
    </div>
  )
}

export default function Legal({ doc }: { doc: 'privacy' | 'cookies' | 'terms' }) {
  const { data } = useApi<Site>('/public/site', 60_000)
  const s = data?.settings ?? {}
  const name = s.name || 'the hospital'
  const contact = s.email || s.phone || 'reception'
  useEffect(() => {
    document.title = `${{ privacy: 'Privacy policy', cookies: 'Cookie policy', terms: 'Terms of use' }[doc]} — ${name}`
  }, [doc, name])

  return (
    <>
      <PublicTop s={data?.settings} />
      <article className="wrap legal page">
        {doc === 'privacy' && (
          <>
            <span className="eyebrow">Legal</span>
            <h1>Privacy policy</h1>
            <p className="muted small">Last updated {UPDATED}</p>
            <p>
              {name} (“we”) respects your privacy. This policy explains what personal and health information we collect through this website, our WhatsApp number and our hospital software,
              why we collect it, and the choices you have. We process personal data in line with India’s Digital Personal Data Protection Act, 2023 and applicable medical record rules.
            </p>
            <h2>What we collect</h2>
            <ul>
              <li><b>Identity & contact:</b> name, mobile number, age, gender and address you give at booking or registration.</li>
              <li><b>Visit & clinical information:</b> appointments and token numbers, the doctor consulted, consultation notes, lab tests ordered and their status.</li>
              <li><b>Billing:</b> items billed, amounts, discounts and payment mode (cash, UPI or card). We do not store card numbers or UPI PINs.</li>
              <li><b>Messages:</b> what you send to our booking chat or WhatsApp number, so we can reply and complete your booking.</li>
              <li><b>Technical:</b> essential cookies for login and your IP address for security and abuse prevention (rate limiting).</li>
            </ul>
            <h2>Why we use it</h2>
            <ul>
              <li>To book, manage and track OPD tokens and to provide medical care.</li>
              <li>To prepare bills and receipts and to keep accounts as required by law.</li>
              <li>To send service messages: booking confirmation, “you’re next” alerts, receipts and lab report updates. We do not send marketing messages.</li>
              <li>To keep the system secure, prevent fraud and comply with legal obligations.</li>
            </ul>
            <h2>Who can see it</h2>
            <p>
              Only authorised hospital staff, and only what their role needs: reception sees registrations and billing, doctors see their patients, the lab sees lab orders, the pharmacy sees
              pharmacy bills. We share data with service providers that help us run the service — WhatsApp (Meta Platforms) to deliver messages and our hosting provider — under
              confidentiality obligations, and with authorities when the law requires. <b>We never sell your data and we use no advertising or analytics trackers.</b>
            </p>
            <h2>How long we keep it</h2>
            <p>
              Medical and billing records are kept for the period required by applicable medical and tax laws. Login sessions expire automatically (staff 12 hours, patients 30 days),
              one-time login codes after 5 minutes, and booking-chat conversations after 24 hours.
            </p>
            <h2>How we protect it</h2>
            <p>
              Passwords are stored as salted scrypt hashes, login cookies are HTTP-only and cannot be read by scripts, accounts lock after repeated failed attempts, access is role-based, and
              every bill records who created it. Health data is never cached by your browser.
            </p>
            <h2>Your rights</h2>
            <p>
              You may ask to access or correct your information, withdraw consent for optional processing, or request erasure where the law allows (some medical records must be retained).
              You may also raise a grievance. Contact our grievance officer at <b>{contact}</b>{s.address ? `, ${s.address}` : ''}. We respond within 30 days.
            </p>
            <h2>Children</h2>
            <p>Bookings for children must be made by a parent or guardian, who consents on the child’s behalf.</p>
            <h2>Changes</h2>
            <p>We will post any changes on this page with a new “last updated” date.</p>
          </>
        )}

        {doc === 'cookies' && (
          <>
            <span className="eyebrow">Legal</span>
            <h1>Cookie policy</h1>
            <p className="muted small">Last updated {UPDATED}</p>
            <p>We keep cookies to the minimum needed to run the service. There are no advertising, analytics or third-party tracking cookies on this website.</p>
            <h2>What we store</h2>
            <table>
              <thead>
                <tr><th>Name</th><th>Type</th><th>Purpose</th><th>Expires</th></tr>
              </thead>
              <tbody>
                <tr><td>hs_patient</td><td>Essential cookie</td><td>Keeps you signed in to your patient account</td><td>30 days</td></tr>
                <tr><td>hs_staff</td><td>Essential cookie</td><td>Keeps hospital staff signed in</td><td>12 hours</td></tr>
                <tr><td>cookie_consent</td><td>Local storage</td><td>Remembers your choice on this banner</td><td>Until you clear it</td></tr>
                <tr><td>bot_sid</td><td>Preference (local storage)</td><td>Continues your booking chat later — only if you choose “Accept all”; otherwise it is forgotten when the tab closes</td><td>24 hours on our server</td></tr>
              </tbody>
            </table>
            <p>Our fonts and scripts are served from our own server, so visiting this site does not send your data to font or CDN providers.</p>
            <h2>Change your choice</h2>
            <p>You can reset your choice at any time; the banner will appear again.</p>
            <button
              className="btn btn-soft"
              onClick={() => {
                try {
                  localStorage.removeItem('cookie_consent')
                  localStorage.removeItem('bot_sid')
                } catch {
                  /* storage blocked */
                }
                location.reload()
              }}
            >
              <Cookie /> Reset cookie choice
            </button>
          </>
        )}

        {doc === 'terms' && (
          <>
            <span className="eyebrow">Legal</span>
            <h1>Terms of use</h1>
            <p className="muted small">Last updated {UPDATED}</p>
            <h2>Not for emergencies</h2>
            <p>
              Online and WhatsApp booking is for routine OPD visits only. In an emergency call {s.emergency || '108'} or come straight to the emergency ward. Information on this website is
              general and is not a substitute for a consultation.
            </p>
            <h2>Tokens and timings</h2>
            <p>
              A token reserves your place in the doctor’s OPD queue for the chosen day; it is not a fixed appointment time. Waiting times depend on emergencies and consultation length. If you
              miss your turn the token may be marked skipped; reception can put you back in the queue.
            </p>
            <h2>Fees and payment</h2>
            <p>Booking is free. Consultation, lab and pharmacy charges are paid at the hospital as per the bill. Refunds for cancelled services follow hospital policy at the billing counter.</p>
            <h2>Your responsibilities</h2>
            <p>Give accurate details, book only for yourself or people you care for, and do not misuse the booking system (for example by making bookings you do not intend to keep).</p>
            <h2>Liability</h2>
            <p>We work hard to keep the service available and accurate but do not guarantee it will be uninterrupted. Medical care itself is governed by the standards of the medical profession.</p>
            <h2>Governing law</h2>
            <p>These terms are governed by the laws of India. Questions? Contact {contact}.</p>
          </>
        )}
      </article>
      <Footer s={data?.settings} />
    </>
  )
}
