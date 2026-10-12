import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import {
  Activity, Ambulance, ArrowRight, Baby, Bone, Bot as BotIcon, Brain, CalendarCheck, CheckCircle2,
  ChevronLeft, ChevronRight, CircleCheck, Clock, Ear, Eye, FileText, FlaskConical, HeartPulse,
  IndianRupee, Info, Lock, Mail, MapPin, Menu, MessageCircle, Microscope, Phone, Pill, Play, Plus,
  RefreshCw, ShieldAlert, ShieldCheck, Siren, Smartphone, Sparkles, Stethoscope, Ticket, User,
  UserCheck, Users, X,
} from 'lucide-react'
import { useApi, usePublicQueue, type PublicQueue } from '../api.ts'
import { inr, initials, useReveal } from '../ui.tsx'
import Bot, { openBot } from '../components/Bot.tsx'
import './landing.css'

export type Site = {
  settings: Record<string, string>
  departments: { id: number; name: string; description: string; icon: string }[]
  doctors: {
    id: number
    name: string
    qualification: string
    fee: number
    room: string
    days: string
    start_time: string
    end_time: string
    bio: string
    department: string
    department_id: number
  }[]
  stats: { patients: number; doctors: number; departments: number; tests: number }
}

export const DEPT_ICON: Record<string, React.ComponentType<{ size?: number }>> = {
  stethoscope: Stethoscope,
  baby: Baby,
  bone: Bone,
  heart: HeartPulse,
  ear: Ear,
  sparkles: Sparkles,
  siren: Siren,
  brain: Brain,
  eye: Eye,
  activity: Activity,
  microscope: Microscope,
  pill: Pill,
}

const AVATAR = [
  '#0d9488,#0891b2',
  '#6366f1,#8b5cf6',
  '#f43f5e,#f97316',
  '#0891b2,#6366f1',
  '#059669,#0d9488',
  '#d946ef,#6366f1',
  '#f59e0b,#f43f5e',
  '#0ea5e9,#22c55e',
]
export const avatarBg = (i: number) => `linear-gradient(135deg, ${AVATAR[i % AVATAR.length]})`
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const waLink = (n: string, text = 'Hi') =>
  `https://wa.me/${n.replace(/\D/g, '').replace(/^(?=\d{10}$)/, '91')}?text=${encodeURIComponent(text)}`
export const telLink = (n: string) => `tel:${n.replace(/[^\d+]/g, '')}`

export function Brand({ s, to = '/' }: { s?: Record<string, string>; to?: string }) {
  return (
    <Link to={to} className="logo" aria-label={`${s?.name ?? 'Hospital'} home`}>
      <span className="brand-mark">
        <Plus strokeWidth={3} />
      </span>
      <span className="brand-text">
        <strong className="brand-name">{s?.name ?? 'CarePoint Hospital'}</strong>
        <span className="brand-sub">Healthcare & 24×7 Trauma</span>
      </span>
    </Link>
  )
}

/** 24/7 Emergency & Live OPD Queue Banner at the very top */
function EmergencyPulseBar({ s, queue }: { s?: Record<string, string>; queue: PublicQueue[] | null }) {
  const activeCount = (queue ?? []).filter((q) => q.current || q.waiting).length
  return (
    <aside className="pulse-bar" aria-label="Hospital Status and Emergency Hotline">
      <div className="wrap pulse-bar-wrap">
        <div className="pulse-bar-left">
          <span className="live-pill red">
            <span className="live-dot" style={{ background: '#ef4444' }} />
            <strong>24×7 Emergency & Trauma Active</strong>
          </span>
          <span className="pulse-bar-divider" />
          <span className="pulse-bar-item">
            <Ambulance size={14} className="pulse-icon" /> 3 Ambulances On Standby
          </span>
          <span className="pulse-bar-divider hide-mobile" />
          <span className="pulse-bar-item hide-mobile">
            <Clock size={14} className="pulse-icon" /> OPD Live: {activeCount > 0 ? `${activeCount} Clinics Running` : 'Queue Active Today'}
          </span>
        </div>
        <div className="pulse-bar-right">
          {s?.emergency && (
            <a href={telLink(s.emergency)} className="pulse-hotline-btn">
              <Phone size={13} />
              <span>ER: {s.emergency}</span>
            </a>
          )}
          <Link to="/display" className="pulse-link hide-mobile" title="View waiting hall TV display">
            TV Queue Display
          </Link>
          <Link to="/staff/login" className="pulse-link hide-mobile">
            Staff Portal
          </Link>
        </div>
      </div>
    </aside>
  )
}

function Nav({ s, audience, setAudience }: { s?: Record<string, string>; audience: 'patient' | 'public'; setAudience: (a: 'patient' | 'public') => void }) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const on = () => setScrolled(scrollY > 12)
    on()
    addEventListener('scroll', on, { passive: true })
    return () => removeEventListener('scroll', on)
  }, [])

  const links = [
    ['#journey', 'Care Story'],
    ['#care-finder', 'Triage'],
    ['#doctors', 'Doctors'],
    ['#departments', 'Depts'],
    ['#transparency', 'Fair Pricing'],
    ['#faq', 'FAQ'],
    ['#contact', 'Directions'],
  ]

  return (
    <header className={`nav ${scrolled ? 'scrolled' : ''} ${open ? 'open' : ''}`}>
      <div className="wrap">
        <Brand s={s} />

        <div className="audience-toggle-nav" role="radiogroup" aria-label="Choose Experience Mode">
          <button
            type="button"
            className={`aud-btn ${audience === 'patient' ? 'active' : ''}`}
            onClick={() => setAudience('patient')}
            aria-pressed={audience === 'patient'}
            title="Switch to Patient View"
          >
            <User size={13} />
            <span>Patient</span>
          </button>
          <button
            type="button"
            className={`aud-btn ${audience === 'public' ? 'active' : ''}`}
            onClick={() => setAudience('public')}
            aria-pressed={audience === 'public'}
            title="Switch to Public & Visitors View"
          >
            <Users size={13} />
            <span>Public & ER</span>
          </button>
        </div>

        <nav className="nav-links" aria-label="Main Navigation">
          {links.map(([h, l]) => (
            <a key={h} href={h} onClick={() => setOpen(false)}>
              {l}
            </a>
          ))}
        </nav>

        <div className="nav-cta">
          <Link className="btn btn-ghost btn-sm nav-login-btn" to="/login" title="Access test reports and token history">
            <Smartphone size={14} /> Portal
          </Link>
          <a href="#book" className="btn btn-primary btn-sm nav-book-btn" onClick={() => setOpen(false)}>
            <Ticket size={14} /> Book token
          </a>
        </div>

        <button
          className="btn btn-ghost btn-icon nav-burger"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
    </header>
  )
}

/** Live OPD queue with interactive demo simulation mode */
function LiveQueue({ queue }: { queue: PublicQueue[] | null }) {
  const [simActive, setSimActive] = useState(false)
  const [simStep, setSimStep] = useState(0)
  const rows = (queue ?? []).filter((q) => q.current || q.waiting || q.booked).slice(0, 4)

  useEffect(() => {
    if (!simActive) return
    const timer = setInterval(() => {
      setSimStep((s) => (s + 1) % 4)
    }, 2800)
    return () => clearInterval(timer)
  }, [simActive])

  return (
    <div className="live-card">
      <div className="live-card-head">
        <div>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <h3>Live OPD Turn Radar</h3>
            <span className="badge green">
              <span className="live-dot" /> Live sync
            </span>
          </div>
          <span className="small muted">Updates instantly on screens and WhatsApp</span>
        </div>
        <button
          type="button"
          className={`btn btn-xs ${simActive ? 'btn-soft' : 'btn-ghost'}`}
          onClick={() => setSimActive(!simActive)}
          title="See how live notifications look on your phone"
        >
          <RefreshCw size={12} className={simActive ? 'spin' : ''} />
          {simActive ? 'Stop Demo' : 'Simulate Turn'}
        </button>
      </div>

      {simActive && (
        <div className="sim-banner" role="status">
          <div className="sim-badge">
            <Smartphone size={13} />
            <span>Interactive Patient Simulator:</span>
          </div>
          <div className="sim-status">
            {simStep === 0 && 'Token #14 Confirmed via WhatsApp · Relaxing at home'}
            {simStep === 1 && 'Token #11 Now In Consultation · 3 Patients ahead'}
            {simStep === 2 && '🔔 WhatsApp Alert: You are next in line! Proceed to Room 101'}
            {simStep === 3 && '✅ In Consultation with Dr. Arvind Mehta · Zero waiting hall fatigue'}
          </div>
        </div>
      )}

      {!queue ? (
        <div className="stack" style={{ gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 52, borderRadius: 14 }} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="empty small" style={{ padding: '24px 12px' }}>
          <Clock size={28} style={{ color: 'var(--brand)' }} />
          <b>No active queue right now</b>
          <span>OPD begins at 9:00 AM. Book your token now to reserve the earliest slot.</span>
        </div>
      ) : (
        <div className="q-rows-container">
          {rows.map((q) => (
            <div className="q-row" key={q.doctorId}>
              <div
                className={`q-token ${q.current ? 'bump' : 'idle'}`}
                aria-label={q.current ? `Now serving token ${q.current}` : 'Not started'}
              >
                {q.current ? `#${q.current}` : '—'}
              </div>
              <div className="grow">
                <b className="ellipsis" style={{ display: 'block' }}>
                  {q.doctor}
                </b>
                <span className="small muted ellipsis" style={{ display: 'block' }}>
                  {q.department}
                  {q.room && ` · Room ${q.room}`}
                </span>
              </div>
              <div className="right">
                <b className="num" style={{ fontSize: 16 }}>{q.waiting}</b>
                <div className="tiny muted">waiting</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Integrated Live Queue Feature Perks (no clipping) */}
      <div className="live-card-perks">
        <div className="perk-item">
          <span className="perk-ic" style={{ background: '#25d366' }}>
            <MessageCircle size={14} />
          </span>
          <div>
            <b>WhatsApp Pass</b>
            <span className="tiny muted">Live turn alerts</span>
          </div>
        </div>
        <div className="perk-divider" />
        <div className="perk-item">
          <span className="perk-ic" style={{ background: 'var(--grad)' }}>
            <Ticket size={14} />
          </span>
          <div>
            <b>You're Next 🔔</b>
            <span className="tiny muted">Arrive just in time</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** The 5-Chapter Interactive Storytelling Journey */
const STORY_CHAPTERS = [
  {
    step: '01',
    time: '07:15 AM',
    place: 'At Home · Bedside',
    title: 'The Waking Concern',
    tagline: 'From sudden illness to a confirmed appointment in 30 seconds',
    story:
      'You wake up with high fever and body ache. In ordinary hospitals, this triggers panic: rushing out in the morning chill to fight for a queue ticket outside a crowded counter. At CarePoint, you stay wrapped in your blanket. You send "Hi" to CarePoint on WhatsApp or tap "Book Token" here. In under 30 seconds, Token #14 is confirmed with Dr. Arvind Mehta. No prepayment, no stress.',
    traditionalPain: '6:00 AM rush, 1.5 hr waiting in cold counter queues, losing work hours.',
    carepointRelief: '30-second token booking on your phone, confirmed doctor slot, ₹0 advance fee.',
    badge: 'Step 1: Smart Booking',
    demoType: 'whatsapp',
  },
  {
    step: '02',
    time: '10:05 AM',
    place: 'At Home → On Route',
    title: 'The Live Turn Radar',
    tagline: 'Arrive right on time instead of wasting 3 hours in a contagious waiting room',
    story:
      'You have breakfast and rest. Dr. Mehta opens his OPD at 9:30 AM. From your sofa, you tap your live token tracking link. As Token #11 is called, your phone buzzes with a WhatsApp alert: "You are next in line". You take a relaxed 15-minute cab ride and arrive at the hospital gate exactly as your token is displayed.',
    traditionalPain: 'Sitting for 3+ hours in a packed, stuffy hall next to contagious patients.',
    carepointRelief: 'Live turn radar updates in real-time; WhatsApp buzzer reminds you when to leave home.',
    badge: 'Step 2: Smart Arrival',
    demoType: 'tracker',
  },
  {
    step: '03',
    time: '10:35 AM',
    place: 'Room 101 · Private Consultation',
    title: 'Compassionate, Unhurried Care',
    tagline: 'A doctor who listens, investigates thoroughly, and explains clearly',
    story:
      'You step straight into clean Consultation Room 101 without counter arguments. Dr. Arvind Mehta greets you with warmth, listens carefully to your symptoms, records your vitals, and checks your medical history. Because the hospital manages queue flow scientifically, the doctor is never hurried. You receive clear explanations, medical reassurance, and a targeted treatment plan.',
    traditionalPain: 'A rushed 90-second consultation by an exhausted doctor clearing a 60-person backlog.',
    carepointRelief: 'Dedicated 1-on-1 doctor attention, complete vitals examination, calm private clinic.',
    badge: 'Step 3: Clinical Care',
    demoType: 'doctor',
  },
  {
    step: '04',
    time: '11:05 AM',
    place: 'Hospital Corridor · Lab & Pharmacy',
    title: 'Everything Under One Roof',
    tagline: 'In-house accredited lab with same-day reports & authentic MRP pharmacy',
    story:
      'Dr. Mehta advises a Complete Blood Count (CBC) and Dengue screening. You walk 20 steps down the corridor to our sanitized in-house pathology lab. Samples are drawn gently in 2 minutes. Right next door is our 24×7 pharmacy, stocking authentic medicines at strict MRP with batch and expiry tracking. Within 2 hours, your test results are processed and delivered to your phone.',
    traditionalPain: 'Hunting for diagnostic labs across the city, returning next day for reports, marked-up medicines.',
    carepointRelief: 'NABL-aligned in-house lab (reports in 2 hrs), genuine medicines at MRP with full receipt.',
    badge: 'Step 4: Rapid Diagnostics',
    demoType: 'lab',
  },
  {
    step: '05',
    time: '12:15 PM',
    place: 'Home · Patient Portal',
    title: 'Digital Recovery & Records',
    tagline: 'Your complete health history, receipts and follow-up safely in your pocket',
    story:
      'You return home to recover. Your itemized receipt and digital lab reports are automatically saved under your mobile number. Simply sign in with a 1-time WhatsApp code anytime to download bills, review prescriptions, or schedule your follow-up checkup. No paper slips lost, no repetitive questions on your next visit.',
    traditionalPain: 'Lost physical paper receipts, forgotten prescriptions, starting from zero at every visit.',
    carepointRelief: 'Permanent digital records in Patient Portal, 1-tap WhatsApp OTP login, seamless follow-ups.',
    badge: 'Step 5: Lasting Health',
    demoType: 'portal',
  },
]

/** Curated Symptom to Department Triage Matcher */
const SYMPTOMS_DATA = [
  {
    id: 'fever',
    title: 'Fever, Chills & Weakness',
    icon: Stethoscope,
    dept: 'General Medicine',
    doctor: 'Dr. Arvind Mehta',
    qualification: 'MBBS, MD (Medicine)',
    room: '101',
    fee: 400,
    tests: ['CBC (Complete Blood Count)', 'Dengue NS1 Antigen', 'Widal Test'],
    summary: 'Evaluate viral fevers, seasonal infections, malaria, dengue, typhoid, or metabolic fatigue.',
  },
  {
    id: 'heart',
    title: 'Chest Discomfort & BP',
    icon: HeartPulse,
    dept: 'Cardiology',
    doctor: 'Dr. Priya Nair',
    qualification: 'MBBS, MD, DM (Cardiology)',
    room: '202',
    fee: 800,
    tests: ['12-Lead ECG', 'Lipid Profile', 'Echo / BP Evaluation'],
    summary: 'Hypertension management, palpitations, chest pressure, breathlessness, and preventive cardiac care.',
  },
  {
    id: 'child',
    title: 'Child Care & Vaccination',
    icon: Baby,
    dept: 'Paediatrics',
    doctor: 'Dr. Rohan Verma',
    qualification: 'MBBS, MD (Paediatrics)',
    room: '102',
    fee: 450,
    tests: ['Growth & Milestone Check', 'Paediatric CBC', 'Scheduled Vaccines'],
    summary: 'Newborn care, infant nutrition, developmental screening, fever in children, and immunization.',
  },
  {
    id: 'bones',
    title: 'Fractures, Joints & Spine',
    icon: Bone,
    dept: 'Orthopaedics',
    doctor: 'Dr. Sameer Khan',
    qualification: 'MBBS, MS (Ortho)',
    room: '201',
    fee: 600,
    tests: ['Digital X-Ray', 'Calcium & Vitamin D', 'Uric Acid'],
    summary: 'Acute trauma, sprains, knee arthritis, backache, sports injuries, and spine rehabilitation.',
  },
  {
    id: 'gynae',
    title: "Pregnancy & Women's Health",
    icon: Sparkles,
    dept: 'Gynaecology & Obstetrics',
    doctor: 'Dr. Neha Kapoor',
    qualification: 'MBBS, MS (OBG)',
    room: '104',
    fee: 500,
    tests: ['Pelvic Ultrasound', 'Thyroid Profile', 'HbA1c & Iron Study'],
    summary: 'Antenatal checkups, high-risk pregnancy monitoring, PCOD/PCOS, and laparoscopic evaluation.',
  },
  {
    id: 'ent',
    title: 'Ear, Nose, Throat & Sinus',
    icon: Ear,
    dept: 'ENT',
    doctor: 'Dr. Vikram Singh',
    qualification: 'MBBS, MS (ENT)',
    room: '103',
    fee: 500,
    tests: ['Otoscopy / Sinus Examination', 'Throat Swab', 'Hearing Assessment'],
    summary: 'Persistent ear pain, sinus headaches, tonsillitis, voice changes, and allergic rhinitis.',
  },
  {
    id: 'eye',
    title: 'Vision Blur & Eye Care',
    icon: Eye,
    dept: 'Ophthalmology',
    doctor: 'Dr. Kavita Rao',
    qualification: 'MBBS, MS (Ophthalmology)',
    room: '105',
    fee: 500,
    tests: ['Refraction & Vision Test', 'Slit Lamp Exam', 'Intraocular Pressure'],
    summary: 'Refractive errors, red eye, cataract evaluation, computer vision strain, and glaucoma checks.',
  },
  {
    id: 'er',
    title: '24×7 Emergency & Casualty',
    icon: Siren,
    dept: 'Emergency & Trauma',
    doctor: 'Dr. Anil Das',
    qualification: 'MBBS, Emergency Medicine',
    room: 'ER',
    fee: 300,
    tests: ['Emergency Trauma Vitals', 'Stat ECG', 'Instant Glucose & Troponin'],
    summary: 'Acute injury, breathing distress, sudden collapse, poisoning, deep lacerations, and critical stabilization.',
  },
]

/** Transparent Diagnostics Price Guide */
const PRICE_GUIDE = [
  { name: 'Blood Sugar Fasting', cat: 'Biochemistry', tat: '2 hrs', price: 60, popular: true },
  { name: 'Blood Sugar Post Prandial', cat: 'Biochemistry', tat: '2 hrs', price: 60, popular: false },
  { name: 'Urine Routine & Microscopic', cat: 'Clinical Pathology', tat: '2 hrs', price: 150, popular: false },
  { name: 'Complete Blood Count (CBC)', cat: 'Haematology', tat: 'Same day', price: 300, popular: true },
  { name: 'HbA1c (3-Month Sugar)', cat: 'Biochemistry', tat: 'Same day', price: 450, popular: true },
  { name: 'Lipid Profile (Cholesterol)', cat: 'Biochemistry', tat: 'Same day', price: 600, popular: true },
  { name: 'Kidney Function Test (KFT)', cat: 'Biochemistry', tat: 'Same day', price: 600, popular: false },
  { name: 'Liver Function Test (LFT)', cat: 'Biochemistry', tat: 'Same day', price: 650, popular: false },
  { name: 'Thyroid Profile (T3 T4 TSH)', cat: 'Hormones', tat: '24 hrs', price: 550, popular: true },
  { name: 'Dengue NS1 Rapid Antigen', cat: 'Serology', tat: 'Same day', price: 600, popular: true },
  { name: '12-Lead ECG with Interpretation', cat: 'Cardiology Service', tat: 'Instant', price: 300, popular: true },
  { name: 'Digital Chest X-Ray', cat: 'Radiology Service', tat: '30 mins', price: 400, popular: false },
]

/** Patient & Public Story Testimonials */
const COMMUNITY_STORIES = [
  {
    author: 'Ramesh K. (58 yrs)',
    role: 'Patient with Chronic Diabetes',
    location: 'Civil Lines',
    tag: 'Zero-Wait Experience',
    quote:
      'Before CarePoint, visiting a doctor meant taking leave from my shop and sitting 3 to 4 hours in a crammed hall just for a routine BP and sugar check. With CarePoint, I tracked my token from my store counter, walked in 10 minutes before Dr. Mehta called #18, and finished tests and medicines in 45 minutes.',
    stats: 'Time Saved: ~3 Hours',
  },
  {
    author: 'Ananya S. & Baby Aarav',
    role: 'Mother of 2-Year-Old',
    location: 'Green Park Colony',
    tag: 'Paediatric Care on WhatsApp',
    quote:
      'My son woke up with a 102°F fever. The thought of waiting with a cranky baby in a loud hospital was stressful. I booked Token #06 on WhatsApp while feeding him, watched the live tracker, and walked straight into Dr. Rohan’s room. The gentleness and efficiency brought tears of relief to my eyes.',
    stats: 'Wait on Campus: 8 Minutes',
  },
  {
    author: 'Vikash P. (41 yrs)',
    role: 'Community Resident & Family Caregiver',
    location: 'Station Road',
    tag: '24×7 Emergency & Transparency',
    quote:
      'My father experienced acute chest tightness at 2:00 AM. We called their emergency number, the ambulance was dispatched immediately, and the casualty team had an ECG running within 5 minutes of arrival. No hidden charges, no unnecessary tests—just ethical, life-saving medicine.',
    stats: 'Emergency Triage: 4 Minutes',
  },
]

const FAQ = [
  ['How do I book an OPD token without waiting?', 'Chat with CareBot right here on this page or send "Hi" to our WhatsApp number. Choose your department and preferred doctor. You immediately receive a confirmed token number and a live tracking link with zero advance fee.'],
  ['Do I have to pay anything while booking online?', 'No. Online booking is 100% free. The consultation fee is paid directly at reception when you arrive using Cash, UPI (GPay/PhonePe/Paytm), or Credit/Debit Card, and you receive an itemized digital receipt.'],
  ['How does the live token tracker save my time?', 'Your tracking link shows the token currently inside the doctor’s chamber in real time and how many patients are ahead of you. Plus, our automated WhatsApp system pings you when you are next in line so you can commute relaxed.'],
  ['What should I do during an emergency?', 'Do not wait or book online—call our 24×7 Emergency Hotline (+91 90000 11111) immediately or arrive directly at our Casualty Ward. Our trauma doctors, nurses, and critical care units are staffed round the clock.'],
  ['Can I access lab reports and receipts online?', 'Yes! Log into the Patient Portal with your mobile number. A secure 6-digit one-time code is sent on WhatsApp. You can view, download, and print all historical doctor visits, lab reports, and tax receipts anytime.'],
  ['Is CarePoint pricing ethical and transparent?', 'Yes. We follow a strict Public Transparency Charter: zero kickbacks or commissions to doctors, in-house tests at regulated rates, genuine medicines at strict MRP, and itemized billing with zero hidden charges.'],
]

export default function Landing() {
  const { data: site } = useApi<Site>('/public/site', 60_000)
  const queue = usePublicQueue()
  const [audience, setAudience] = useState<'patient' | 'public'>('patient')
  const [activeChapter, setActiveChapter] = useState(0)
  const [selectedSymptom, setSelectedSymptom] = useState<string>('fever')
  const [deptFilter, setDeptFilter] = useState<string>('All')
  const [chat, setChat] = useState<{ open: boolean; script?: string[]; n: number }>({ open: false, n: 0 })
  const s = site?.settings
  useReveal([site, audience])

  useEffect(() => {
    if (s?.name) document.title = `${s.name} — ${s.tagline || 'Multispeciality Hospital & 24×7 Emergency'}`
  }, [s?.name, s?.tagline])

  useEffect(() => {
    if (site && location.hash) {
      const el = document.querySelector(location.hash)
      if (el) el.scrollIntoView({ behavior: 'smooth' })
    }
  }, [site])

  const onOpen = useCallback((e: Event) => {
    setChat((c) => ({ open: true, script: (e as CustomEvent).detail, n: c.n + 1 }))
  }, [])

  useEffect(() => {
    addEventListener('bot:open', onOpen)
    return () => removeEventListener('bot:open', onOpen)
  }, [onOpen])

  const currentSymptom = useMemo(
    () => SYMPTOMS_DATA.find((item) => item.id === selectedSymptom) || SYMPTOMS_DATA[0],
    [selectedSymptom],
  )

  const filteredDoctors = useMemo(() => {
    if (!site?.doctors) return []
    if (deptFilter === 'All') return site.doctors
    return site.doctors.filter((d) => d.department.toLowerCase().includes(deptFilter.toLowerCase()))
  }, [site?.doctors, deptFilter])

  const chapter = STORY_CHAPTERS[activeChapter]

  return (
    <>
      {/* 1. Emergency & Status Pulse Bar */}
      <EmergencyPulseBar s={s} queue={queue} />

      {/* 2. Main Navigation with Perspective Switcher */}
      <Nav s={s} audience={audience} setAudience={setAudience} />

      <main id="main-content">
        {/* 3. Hero Section with Dual Audience Storytelling */}
        <section className={`l-hero ${audience}`}>
          <div className="hero-bg">
            <div className="blob b1" />
            <div className="blob b2" />
          </div>
          <div className="wrap hero-grid">
            <div className="stagger hero-copy">
              {/* Audience Mode Switcher (Hero Centerpiece) */}
              <div className="hero-aud-switch" role="radiogroup" aria-label="Audience Selector">
                <button
                  type="button"
                  className={`hero-aud-card ${audience === 'patient' ? 'active' : ''}`}
                  onClick={() => setAudience('patient')}
                  aria-pressed={audience === 'patient'}
                >
                  <span className="aud-ic">
                    <User size={16} />
                  </span>
                  <div className="aud-txt">
                    <strong>Patient Mode</strong>
                    <span>0-Wait OPD & WhatsApp turn pass</span>
                  </div>
                </button>
                <button
                  type="button"
                  className={`hero-aud-card ${audience === 'public' ? 'active' : ''}`}
                  onClick={() => setAudience('public')}
                  aria-pressed={audience === 'public'}
                >
                  <span className="aud-ic">
                    <Users size={16} />
                  </span>
                  <div className="aud-txt">
                    <strong>Public & Visitors</strong>
                    <span>24×7 Trauma & rate card</span>
                  </div>
                </button>
              </div>

              <div className="hero-badges-row">
                <span className="pill">
                  <span className="badge rose">
                    <span className="live-dot" style={{ background: 'var(--rose)' }} /> 24×7
                  </span>
                  Emergency, In-House Lab & Pharmacy
                </span>
                <span className="pill hide-mobile">
                  <ShieldCheck size={14} style={{ color: 'var(--brand)' }} />
                  NABH-Compliant Standards
                </span>
              </div>

              <h1>
                Healthcare with compassion,
                <br />
                <span className="grad-text">zero waiting hall queues.</span>
              </h1>

              <p className="hero-sub">
                {audience === 'patient'
                  ? 'Book your doctor’s token from your couch, track your turn live on WhatsApp, and arrive only when your chamber is ready. Quality care that values your health and your dignity.'
                  : 'Welcome to your city’s 24×7 community health anchor. Round-the-clock casualty, specialist doctors across 8 departments, transparent pricing, and zero commissions.'}
              </p>

              {/* Dynamic Audience CTAs in one neat row */}
              <div className="hero-cta">
                {audience === 'patient' ? (
                  <>
                    <a href="#book" className="btn btn-primary btn-md">
                      <Ticket size={16} /> Book OPD token <ArrowRight className="go" size={15} />
                    </a>
                    {s?.whatsapp && (
                      <a href={waLink(s.whatsapp, 'Hi, I need an OPD token')} target="_blank" rel="noreferrer" className="btn btn-soft btn-md">
                        <MessageCircle size={16} style={{ color: '#16a34a' }} /> WhatsApp token
                      </a>
                    )}
                    <Link to="/login" className="btn btn-ghost btn-md">
                      <Smartphone size={16} /> Patient portal
                    </Link>
                  </>
                ) : (
                  <>
                    {s?.emergency && (
                      <a href={telLink(s.emergency)} className="btn btn-danger btn-md">
                        <Siren size={16} /> Emergency: {s.emergency}
                      </a>
                    )}
                    <a href="#transparency" className="btn btn-primary btn-md">
                      <IndianRupee size={16} /> View rate card
                    </a>
                    <a href="#doctors" className="btn btn-ghost btn-md">
                      <Stethoscope size={16} /> All specialists
                    </a>
                  </>
                )}
              </div>

              {/* Trust Indicators */}
              <div className="trust">
                <div>
                  <b className="num">{site?.stats.doctors ?? '8'}</b>
                  <span>Specialist Doctors</span>
                </div>
                <div>
                  <b className="num">{site?.stats.departments ?? '8'}</b>
                  <span>Clinical Depts</span>
                </div>
                <div>
                  <b className="num">{site ? site.stats.patients.toLocaleString('en-IN') : '12,400+'}</b>
                  <span>Patients Registered</span>
                </div>
                <div>
                  <b>&lt; 15 min</b>
                  <span>Avg. In-Hospital Wait</span>
                </div>
              </div>
            </div>

            {/* Live Queue Radar Component */}
            <div className="hero-radar-container">
              <LiveQueue queue={queue} />
            </div>
          </div>
        </section>

        {/* 4. Centerpiece: The Interactive Storytelling Journey */}
        <section className="section story-section" id="journey">
          <div className="wrap">
            <div className="section-h center" data-reveal>
              <span className="eyebrow">The CarePoint Story</span>
              <h2>Experience Your Visit: Before, During & After</h2>
              <p>
                How modern healthcare should feel: an interactive step-by-step walkthrough of what happens when you or your family need medical care.
              </p>
            </div>

            {/* Interactive Timeline Tabs */}
            <div className="story-nav" role="tablist" aria-label="Journey Chapters" data-reveal>
              {STORY_CHAPTERS.map((ch, idx) => (
                <button
                  key={ch.step}
                  type="button"
                  role="tab"
                  aria-selected={activeChapter === idx}
                  className={`story-tab ${activeChapter === idx ? 'active' : ''}`}
                  onClick={() => setActiveChapter(idx)}
                >
                  <span className="tab-step">{ch.step}</span>
                  <div className="tab-meta">
                    <strong className="tab-title">{ch.title}</strong>
                    <span className="tab-time">{ch.time}</span>
                  </div>
                </button>
              ))}
            </div>

            {/* Active Chapter Showcase Card */}
            <div className="story-canvas" data-reveal>
              <div className="story-content">
                <div className="story-meta-row">
                  <span className="badge brand">{chapter.badge}</span>
                  <span className="story-clock">
                    <Clock size={14} /> {chapter.time} · {chapter.place}
                  </span>
                </div>

                <h3 className="story-heading">{chapter.title}</h3>
                <p className="story-tagline">{chapter.tagline}</p>
                <p className="story-narrative">{chapter.story}</p>

                {/* Side-by-Side Comparison */}
                <div className="story-contrast-grid">
                  <div className="contrast-box traditional">
                    <div className="contrast-head">
                      <X size={16} /> <b>Traditional Hospital Experience</b>
                    </div>
                    <p>{chapter.traditionalPain}</p>
                  </div>
                  <div className="contrast-box carepoint">
                    <div className="contrast-head">
                      <CheckCircle2 size={16} /> <b>The CarePoint Standard</b>
                    </div>
                    <p>{chapter.carepointRelief}</p>
                  </div>
                </div>

                <div className="story-actions">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => openBot(['Book appointment'])}
                  >
                    Experience this: Book Token <ArrowRight size={14} />
                  </button>
                  <div className="story-step-btns">
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      disabled={activeChapter === 0}
                      onClick={() => setActiveChapter((c) => Math.max(0, c - 1))}
                      aria-label="Previous chapter"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <span className="story-step-indicator">
                      {activeChapter + 1} / {STORY_CHAPTERS.length}
                    </span>
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      disabled={activeChapter === STORY_CHAPTERS.length - 1}
                      onClick={() => setActiveChapter((c) => Math.min(STORY_CHAPTERS.length - 1, c + 1))}
                      aria-label="Next chapter"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Interactive Phone Simulation Widget */}
              <div className="story-mockup">
                <div className="mockup-frame">
                  <div className="mockup-screen">
                    <div className="mockup-topbar">
                      <span>9:41</span>
                      <div className="mockup-speaker" />
                      <span>5G 100%</span>
                    </div>

                    {chapter.demoType === 'whatsapp' && (
                      <div className="mockup-wa-view">
                        <div className="wa-header">
                          <span className="brand-mark small">
                            <Plus size={14} strokeWidth={3} />
                          </span>
                          <div>
                            <b>CarePoint Health Desk</b>
                            <span className="tiny">Official WhatsApp Channel</span>
                          </div>
                        </div>
                        <div className="wa-bubbles">
                          <div className="wa-bubble received">
                            <span>Hello Ananya! 👋 Your OPD appointment is confirmed:</span>
                            <div className="wa-token-card">
                              <div className="wa-token-num">Token #14</div>
                              <b>Dr. Arvind Mehta</b>
                              <span className="small">General Medicine · Room 101</span>
                              <div className="wa-token-date">Today · 10:00 AM – 2:00 PM</div>
                            </div>
                            <span className="wa-link-text">🔗 Tap to track live turns from home</span>
                            <span className="wa-time">07:15 AM</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {chapter.demoType === 'tracker' && (
                      <div className="mockup-track-view">
                        <div className="track-head">
                          <span className="badge green">● Live Radar Active</span>
                          <h2>Token #14</h2>
                          <div className="small">Hi Ananya, 3 patients ahead</div>
                        </div>
                        <div className="track-progress">
                          <div className="track-bar" style={{ width: '75%' }} />
                        </div>
                        <div className="track-info-card">
                          <div className="track-row">
                            <span>Now inside Chamber:</span>
                            <b>Token #11</b>
                          </div>
                          <div className="track-row">
                            <span>Doctor on Duty:</span>
                            <b>Dr. Arvind Mehta</b>
                          </div>
                          <div className="track-row">
                            <span>Consultation Room:</span>
                            <b>Room 101</b>
                          </div>
                        </div>
                        <div className="track-alert-card">
                          <Clock size={16} /> <b>Estimated wait: ~12 minutes</b>
                          <div className="tiny muted">Time to leave home comfortably!</div>
                        </div>
                      </div>
                    )}

                    {chapter.demoType === 'doctor' && (
                      <div className="mockup-clinic-view">
                        <div className="clinic-header">
                          <div className="clinic-avatar">AM</div>
                          <div>
                            <h3>Dr. Arvind Mehta</h3>
                            <span>MBBS, MD (Medicine) · Room 101</span>
                          </div>
                        </div>
                        <div className="clinic-notes">
                          <div className="vitals-row">
                            <div className="vital-item">
                              <span>Pulse</span>
                              <b>76 bpm</b>
                            </div>
                            <div className="vital-item">
                              <span>BP</span>
                              <b>120/80</b>
                            </div>
                            <div className="vital-item">
                              <span>SpO2</span>
                              <b>99%</b>
                            </div>
                          </div>
                          <div className="clinic-card">
                            <b>Diagnosis & Assessment</b>
                            <p className="small">Seasonal viral pyrexia. Lungs clear. Vitals stable.</p>
                          </div>
                          <div className="clinic-card">
                            <b>Prescribed Investigations</b>
                            <div className="chip-row">
                              <span className="chip">CBC Test</span>
                              <span className="chip">Dengue NS1</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {chapter.demoType === 'lab' && (
                      <div className="mockup-lab-view">
                        <div className="lab-header">
                          <FlaskConical size={20} />
                          <b>In-House Pathology Lab</b>
                        </div>
                        <div className="lab-status-card">
                          <span className="badge green">Sample Analyzed</span>
                          <h4>Complete Blood Count</h4>
                          <span className="small muted">Barcode: #L-9842 · In-House Analyzers</span>
                          <div className="lab-param-row">
                            <span>Platelet Count:</span>
                            <b>2.4 Lakh / mcL (Normal)</b>
                          </div>
                          <div className="lab-param-row">
                            <span>WBC Count:</span>
                            <b>7,800 / mcL (Normal)</b>
                          </div>
                          <div className="lab-param-row">
                            <span>Haemoglobin:</span>
                            <b>13.8 g/dL (Normal)</b>
                          </div>
                        </div>
                        <div className="pharmacy-badge-row">
                          <Pill size={14} /> Genuine MRP Pharmacy bill ready at counter
                        </div>
                      </div>
                    )}

                    {chapter.demoType === 'portal' && (
                      <div className="mockup-portal-view">
                        <div className="portal-header">
                          <Smartphone size={16} />
                          <b>Patient Health Vault</b>
                        </div>
                        <div className="portal-records">
                          <div className="record-item">
                            <FileText size={16} />
                            <div>
                              <b>Dr. Mehta Consultation</b>
                              <span className="tiny muted">Today · Paid ₹400 · Room 101</span>
                            </div>
                          </div>
                          <div className="record-item">
                            <FlaskConical size={16} />
                            <div>
                              <b>Lab Report (CBC & Dengue)</b>
                              <span className="tiny green">Verified by Pathologist</span>
                            </div>
                          </div>
                          <div className="record-item">
                            <Ticket size={16} />
                            <div>
                              <b>Follow-up Visit Due</b>
                              <span className="tiny brand">In 5 Days · 1-Tap Rebook</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Interactive Symptom & Care Matcher (Triage) */}
        <section className="section alt" id="care-finder">
          <div className="wrap">
            <div className="section-h center" data-reveal>
              <span className="eyebrow">Smart Triage Navigator</span>
              <h2>Not Sure Where to Start? Choose What You Feel</h2>
              <p>
                Match common symptoms to the right specialist doctor, consultation fee, and recommended diagnostics in one tap.
              </p>
            </div>

            <div className="symptom-triage-container" data-reveal>
              {/* Symptom Selection Grid */}
              <div className="symptom-chips-grid">
                {SYMPTOMS_DATA.map((sym) => {
                  const Icon = sym.icon
                  const isSelected = selectedSymptom === sym.id
                  return (
                    <button
                      key={sym.id}
                      type="button"
                      className={`symptom-chip ${isSelected ? 'active' : ''}`}
                      onClick={() => setSelectedSymptom(sym.id)}
                    >
                      <span className="chip-ic">
                        <Icon size={18} />
                      </span>
                      <span className="chip-label">{sym.title}</span>
                    </button>
                  )
                })}
              </div>

              {/* Resolved Doctor & Department Detail Card */}
              <div className="symptom-detail-card">
                <div className="detail-head">
                  <div className="row" style={{ gap: 12, alignItems: 'center' }}>
                    <span className="badge brand">{currentSymptom.dept}</span>
                    <span className="small muted">Room {currentSymptom.room}</span>
                  </div>
                  <div className="detail-fee">
                    <span className="tiny muted">Consultation Fee</span>
                    <b>{inr(currentSymptom.fee * 100)}</b>
                  </div>
                </div>

                <div className="detail-doctor-row">
                  <div className="avatar" style={{ background: 'var(--grad)' }}>
                    {initials(currentSymptom.doctor)}
                  </div>
                  <div>
                    <h3>{currentSymptom.doctor}</h3>
                    <div className="small muted">{currentSymptom.qualification}</div>
                  </div>
                </div>

                <p className="detail-summary">{currentSymptom.summary}</p>

                <div className="detail-tests">
                  <span className="tiny muted" style={{ display: 'block', marginBottom: 8, fontWeight: 700 }}>
                    COMMON IN-HOUSE TESTS INCLUDED ON CAMPUS:
                  </span>
                  <div className="test-tags">
                    {currentSymptom.tests.map((t) => (
                      <span key={t} className="test-tag">
                        <CircleCheck size={13} /> {t}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="detail-cta-row">
                  <button
                    className="btn btn-primary"
                    onClick={() => openBot(['Book appointment', currentSymptom.dept, currentSymptom.doctor])}
                  >
                    Book token with {currentSymptom.doctor} <ArrowRight size={15} />
                  </button>
                  <a href="#doctors" className="btn btn-ghost btn-sm">
                    View all doctors in this department
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 6. Doctors & Medical Specialists Directory */}
        <section className="section" id="doctors">
          <div className="wrap">
            <div className="section-h" data-reveal>
              <div className="row between wrap" style={{ alignItems: 'flex-end', gap: 16 }}>
                <div>
                  <span className="eyebrow">Medical Faculty</span>
                  <h2>Senior Specialists, Dedicated to You</h2>
                  <p>Transparent OPD days, timings, and consultation fees. Book instantly with zero booking deposit.</p>
                </div>
                {/* Department Filter Pills */}
                <div className="dept-filter-pills" role="radiogroup" aria-label="Filter Doctors by Department">
                  {['All', 'Medicine', 'Paediatrics', 'Gynaecology', 'Orthopaedics', 'Cardiology', 'ENT', 'Eye', 'Emergency'].map((dept) => (
                    <button
                      key={dept}
                      type="button"
                      className={`filter-pill ${deptFilter === dept ? 'active' : ''}`}
                      onClick={() => setDeptFilter(dept)}
                      aria-pressed={deptFilter === dept}
                    >
                      {dept}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="doc-grid">
              {filteredDoctors.map((d, i) => (
                <article className="doc hover-lift" key={d.id} data-reveal style={{ '--d': `${(i % 4) * 0.06}s` } as React.CSSProperties}>
                  <div className="row">
                    <div className="avatar" style={{ background: avatarBg(i) }} aria-hidden>
                      {initials(d.name)}
                    </div>
                    <div className="grow">
                      <h3>{d.name}</h3>
                      <div className="small muted">{d.qualification}</div>
                    </div>
                  </div>

                  <span className="badge brand" style={{ justifySelf: 'start', width: 'fit-content' }}>
                    {d.department}
                  </span>

                  {d.bio && (
                    <p className="small" style={{ color: 'var(--ink-2)' }}>
                      {d.bio}
                    </p>
                  )}

                  <div className="days" aria-label={`OPD days: ${d.days}`}>
                    {WEEK.map((w) => (
                      <span key={w} className={d.days.includes(w) ? 'on' : ''}>
                        {w}
                      </span>
                    ))}
                  </div>

                  <div className="small muted row" style={{ gap: 6 }}>
                    <Clock size={15} /> {d.start_time === '00:00' ? 'Round the clock (24×7)' : `${d.start_time} – ${d.end_time}`}
                    {d.room && ` · Room ${d.room}`}
                  </div>

                  <div className="doc-f">
                    <div>
                      <div className="tiny muted">Consultation</div>
                      <b className="num">{inr(d.fee)}</b>
                    </div>
                    <button
                      className="btn btn-soft btn-sm"
                      onClick={() => openBot(['Book appointment', d.department, d.name])}
                    >
                      Book token <ArrowRight className="go" size={14} />
                    </button>
                  </div>
                </article>
              ))}

              {!site &&
                [0, 1, 2, 3].map((i) => (
                  <div key={i} className="skeleton" style={{ height: 260, borderRadius: 20 }} />
                ))}
            </div>
          </div>
        </section>

        {/* 7. Clinical Departments Grid */}
        <section className="section alt" id="departments">
          <div className="wrap">
            <div className="section-h center" data-reveal>
              <span className="eyebrow">Centres of Excellence</span>
              <h2>Specialised Medical Care Under One Roof</h2>
              <p>Equipped with advanced diagnostics, sanitized recovery bays, and emergency support for every family member.</p>
            </div>
            <div className="dept-grid">
              {(site?.departments ?? []).map((d, i) => {
                const Icon = DEPT_ICON[d.icon] ?? Stethoscope
                return (
                  <article className="dept hover-lift" key={d.id} data-reveal style={{ '--d': `${(i % 4) * 0.06}s` } as React.CSSProperties}>
                    <div className="ic">
                      <Icon size={24} />
                    </div>
                    <h3>{d.name}</h3>
                    <p>{d.description}</p>
                    <button
                      type="button"
                      className="dept-link-btn"
                      onClick={() => {
                        setDeptFilter(d.name.split(' ')[0])
                        document.querySelector('#doctors')?.scrollIntoView({ behavior: 'smooth' })
                      }}
                    >
                      View specialists <ArrowRight size={13} />
                    </button>
                  </article>
                )
              })}
              {!site && [0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 180, borderRadius: 20 }} />)}
            </div>
          </div>
        </section>

        {/* 8. Public Transparency & Ethical Rate Card Hub */}
        <section className="section" id="transparency">
          <div className="wrap">
            <div className="section-h center" data-reveal>
              <span className="eyebrow">Public Trust & Ethics</span>
              <h2>Our Public Transparency Charter</h2>
              <p>Healthcare should be honest, upfront, and dignified. We display our laboratory and clinic rates openly with zero surprise charges.</p>
            </div>

            <div className="transparency-grid" data-reveal>
              {/* Left Column: The 5 Ethical Guarantees */}
              <div className="charter-card">
                <h3>Our 5 Hospital Guarantees</h3>
                <div className="guarantees-list">
                  <div className="guarantee-item">
                    <span className="ic-g green">
                      <ShieldCheck size={20} />
                    </span>
                    <div>
                      <b>Zero Diagnostic Kickbacks</b>
                      <p>Our physicians never receive commissions on diagnostic tests or pharmaceutical prescriptions. Only medically required tests are advised.</p>
                    </div>
                  </div>

                  <div className="guarantee-item">
                    <span className="ic-g brand">
                      <Ticket size={20} />
                    </span>
                    <div>
                      <b>Free Online Token Booking</b>
                      <p>Book any appointment online or on WhatsApp for ₹0. Pay the standard consultation fee at reception only after you arrive.</p>
                    </div>
                  </div>

                  <div className="guarantee-item">
                    <span className="ic-g violet">
                      <IndianRupee size={20} />
                    </span>
                    <div>
                      <b>100% Itemized Receipts</b>
                      <p>Every single test, bandage, and medicine is listed on your GST-compliant bill. Digital copies are immediately accessible on your phone.</p>
                    </div>
                  </div>

                  <div className="guarantee-item">
                    <span className="ic-g amber">
                      <Pill size={20} />
                    </span>
                    <div>
                      <b>Authentic MRP Pharmacy</b>
                      <p>All in-house medications are sourced directly from licensed pharmaceutical distributors with verifiable batch numbers and expiration dates.</p>
                    </div>
                  </div>

                  <div className="guarantee-item">
                    <span className="ic-g rose">
                      <Lock size={20} />
                    </span>
                    <div>
                      <b>Strict Patient Privacy</b>
                      <p>Zero third-party advertising trackers or selling of personal telephone numbers. Your medical records remain between you and your healthcare team.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Transparent Diagnostic Rate Card */}
              <div className="rate-card-table-wrap">
                <div className="rate-card-header">
                  <div>
                    <h3>In-House Diagnostic Rate Card</h3>
                    <span className="small muted">Regulated pricing with same-day reports</span>
                  </div>
                  <span className="badge green">NABL Aligned</span>
                </div>

                <div className="rates-table-container">
                  <table className="rates-table">
                    <thead>
                      <tr>
                        <th>Investigation Name</th>
                        <th>Category</th>
                        <th>Turnaround</th>
                        <th className="right">Standard Fee</th>
                      </tr>
                    </thead>
                    <tbody>
                      {PRICE_GUIDE.map((p) => (
                        <tr key={p.name}>
                          <td>
                            <div className="rate-name-cell">
                              <b>{p.name}</b>
                              {p.popular && <span className="badge-tag">Frequent</span>}
                            </div>
                          </td>
                          <td className="muted small">{p.cat}</td>
                          <td className="muted small">{p.tat}</td>
                          <td className="right rate-price">
                            <b>{inr(p.price * 100)}</b>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="rate-card-footer">
                  <span className="small muted">Need a specialized profile not listed here? Ask CareBot or visit reception.</span>
                  <button className="btn btn-sm btn-ghost" onClick={() => openBot(['Inquire about lab tests'])}>
                    Ask CareBot about tests
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 9. Real Patient & Community Stories */}
        <section className="section alt" id="stories">
          <div className="wrap">
            <div className="section-h center" data-reveal>
              <span className="eyebrow">Real Experiences</span>
              <h2>Stories of Reclaiming Time & Health</h2>
              <p>Hear from real patients and families who experienced the zero-wait model during routine visits and emergencies.</p>
            </div>

            <div className="stories-grid" data-reveal>
              {COMMUNITY_STORIES.map((story) => (
                <article key={story.author} className="story-card hover-lift">
                  <div className="story-card-top">
                    <span className="badge brand">{story.tag}</span>
                    <span className="story-stat-badge">{story.stats}</span>
                  </div>
                  <blockquote className="story-quote">“{story.quote}”</blockquote>
                  <div className="story-author-meta">
                    <div className="author-avatar">{initials(story.author)}</div>
                    <div>
                      <b>{story.author}</b>
                      <div className="tiny muted">{story.role} · {story.location}</div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 10. Book Your OPD Token Section */}
        <section className="section" id="book">
          <div className="wrap book-grid">
            <div data-reveal>
              <span className="eyebrow">Instant Token Booking</span>
              <h2 style={{ fontSize: 'clamp(30px,3.6vw,44px)', marginTop: 12 }}>
                Skip the Counter Queue From Your Phone
              </h2>
              <p style={{ marginTop: 14, color: 'var(--ink-2)', fontSize: 17 }}>
                CareBot reserves your OPD token in under 45 seconds. No separate mobile apps, no complex forms, and zero advance payment required.
              </p>

              <ul className="ticks">
                {[
                  '100% Free booking — pay the doctor’s fee at reception when you arrive',
                  'Instant digital token number + live turn tracking link',
                  'Automated WhatsApp notification when you are next in line',
                  'Cancel or reschedule easily anytime from the Patient Portal',
                  'Access doctor consultation schedules and fee upfront',
                ].map((t) => (
                  <li key={t}>
                    <CircleCheck /> {t}
                  </li>
                ))}
              </ul>

              {s?.whatsapp && (
                <div className="wa-prompt-box">
                  <a className="btn btn-lg wa-hero-btn" href={waLink(s.whatsapp, 'Hi, I would like to book a token')} target="_blank" rel="noreferrer">
                    <MessageCircle size={20} /> Prefer WhatsApp? Say “Hi” to CarePoint
                  </a>
                  <span className="small muted">Available 24×7 with automated booking assistance</span>
                </div>
              )}
            </div>

            <div data-reveal style={{ '--d': '0.1s' } as React.CSSProperties}>
              {chat.open ? (
                <div className="chat" style={{ display: 'grid', placeItems: 'center', textAlign: 'center' }}>
                  <div className="empty">
                    <BotIcon size={36} style={{ color: 'var(--brand)' }} />
                    <b>CareBot is currently open in the floating bubble</b>
                    <button className="btn btn-sm btn-primary" onClick={() => setChat((c) => ({ ...c, open: false }))}>
                      Dock CareBot Here
                    </button>
                  </div>
                </div>
              ) : (
                <Bot />
              )}
            </div>
          </div>
        </section>

        {/* 11. Frequently Asked Questions */}
        <section className="section alt" id="faq">
          <div className="wrap">
            <div className="section-h center" data-reveal>
              <span className="eyebrow">Questions & Answers</span>
              <h2>Everything You Need to Know</h2>
              <p>Clear, direct answers about appointments, emergency protocols, queue tracking, and payments.</p>
            </div>
            <div className="faq">
              {FAQ.map(([q, a], i) => (
                <details key={q} data-reveal style={{ '--d': `${i * 0.04}s` } as React.CSSProperties}>
                  <summary>
                    <span>{q}</span>
                    <Plus size={20} />
                  </summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* 12. Hospital Location, Visiting Hours & Contact */}
        <section className="section" id="contact">
          <div className="wrap">
            <div className="section-h" data-reveal>
              <span className="eyebrow">Directions & Emergency</span>
              <h2>Here When You Need Us</h2>
              <p>{s?.hours || 'OPD: Mon–Sat, 9:00 AM – 7:00 PM · Casualty & Emergency: 24×7'}</p>
            </div>

            <div className="contact">
              {s?.phone && (
                <a href={telLink(s.phone)} className="hover-lift" data-reveal>
                  <span className="ic">
                    <Phone size={20} />
                  </span>
                  <div>
                    <b>Main Reception</b>
                    <span>{s.phone}</span>
                  </div>
                </a>
              )}
              {s?.emergency && (
                <a
                  href={telLink(s.emergency)}
                  className="hover-lift"
                  data-reveal
                  style={{ '--d': '0.06s' } as React.CSSProperties}
                >
                  <span className="ic" style={{ background: 'var(--rose-50)', color: 'var(--rose)' }}>
                    <Siren size={20} />
                  </span>
                  <div>
                    <b>Emergency 24×7</b>
                    <span>{s.emergency}</span>
                  </div>
                </a>
              )}
              {s?.email && (
                <a href={`mailto:${s.email}`} className="hover-lift" data-reveal style={{ '--d': '0.12s' } as React.CSSProperties}>
                  <span className="ic">
                    <Mail size={20} />
                  </span>
                  <div>
                    <b>Email Desk</b>
                    <span>{s.email}</span>
                  </div>
                </a>
              )}
              {s?.address && (
                <a
                  href={s.map_url || `https://www.google.com/maps/search/${encodeURIComponent(s.address)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover-lift"
                  data-reveal
                  style={{ '--d': '0.18s' } as React.CSSProperties}
                >
                  <span className="ic">
                    <MapPin size={20} />
                  </span>
                  <div>
                    <b>Hospital Address</b>
                    <span>{s.address}</span>
                  </div>
                </a>
              )}
            </div>

            {/* Bottom Callout Banner */}
            <div className="cta-band" style={{ marginTop: 48 }} data-reveal>
              <div>
                <h2>Feeling unwell today? Book your token before you leave home.</h2>
                <p>Arrive when it is nearly your turn. Real-time queue tracking does the waiting for you.</p>
              </div>
              <button className="btn btn-primary btn-lg" onClick={() => openBot(['Book appointment'])}>
                Book now with CareBot <ArrowRight className="go" size={16} />
              </button>
            </div>
          </div>
        </section>
      </main>

      <Footer s={s} />

      {/* Floating Action Button (FAB) */}
      <div className="fab" role="region" aria-label="Quick Communication">
        {s?.whatsapp && (
          <a
            className="fab-btn wa"
            href={waLink(s.whatsapp, 'Hi CarePoint')}
            target="_blank"
            rel="noreferrer"
            aria-label="Chat with hospital on WhatsApp"
            title="Chat on WhatsApp"
          >
            <MessageCircle size={24} />
          </a>
        )}
        <button
          className="fab-btn bot"
          aria-label={chat.open ? 'Close CareBot chat' : 'Open CareBot chat'}
          title="Open CareBot Assistant"
          onClick={() => setChat((c) => ({ open: !c.open, n: c.n + 1 }))}
        >
          {chat.open ? <X size={26} /> : <BotIcon size={26} />}
        </button>
      </div>

      {chat.open && (
        <Bot
          key={chat.n}
          floating
          script={chat.script}
          onClose={() => setChat((c) => ({ ...c, open: false }))}
        />
      )}
    </>
  )
}

export function Footer({ s }: { s?: Record<string, string> }) {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-grid">
          <div>
            <Brand s={s} />
            <p style={{ marginTop: 14, fontSize: 14, maxWidth: 340, lineHeight: 1.6 }}>
              {s?.tagline || 'Multispeciality care close to home'}. 24×7 Casualty, emergency ambulance dispatch, in-house accredited pathology, and transparent pharmacy.
            </p>
            <div className="footer-badges-row" style={{ marginTop: 18 }}>
              <span className="badge brand">GSTIN Verified</span>
              <span className="badge green">In-House Lab 24×7</span>
            </div>
          </div>

          <div>
            <h4>For Patients</h4>
            <ul>
              <li>
                <a href="#book">Book OPD token</a>
              </li>
              <li>
                <Link to="/login">Patient portal (Reports & Bills)</Link>
              </li>
              <li>
                <a href="#journey">The 0-wait story</a>
              </li>
              <li>
                <a href="#care-finder">Symptom triage guide</a>
              </li>
              <li>
                <a href="#doctors">Doctor consultation fees</a>
              </li>
              <li>
                <Link to="/display">Waiting hall TV display</Link>
              </li>
            </ul>
          </div>

          <div>
            <h4>Hospital & Public</h4>
            <ul>
              <li>
                <a href="#transparency">Public rate card & charter</a>
              </li>
              <li>
                <a href="#departments">Clinical departments</a>
              </li>
              <li>
                <a href="#contact">Emergency & ambulance hotline</a>
              </li>
              <li>
                <a href="#stories">Community recovery stories</a>
              </li>
              <li>
                <Link to="/staff/login">Hospital staff sign in</Link>
              </li>
            </ul>
          </div>

          <div>
            <h4>Ethics & Legal</h4>
            <ul>
              <li>
                <Link to="/privacy">Patient privacy policy</Link>
              </li>
              <li>
                <Link to="/cookies">Cookie & tracking policy</Link>
              </li>
              <li>
                <Link to="/terms">Terms of clinical service</Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer-b">
          <span>
            © {new Date().getFullYear()} {s?.name ?? 'CarePoint Hospital'}. All rights reserved. Ethical healthcare without corporate compromise.
          </span>
          <span style={{ color: '#fca5a5' }}>
            In an emergency, call {s?.emergency || '108'} immediately.
          </span>
        </div>
      </div>
    </footer>
  )
}
