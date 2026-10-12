// Shared by server (validation, SQL whitelist) and client (forms, nav). Keep it data-only.

export const ROLES = ['owner', 'doctor', 'reception', 'lab', 'pharmacy'] as const
export type Role = (typeof ROLES)[number]
export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner / Admin',
  doctor: 'Doctor',
  reception: 'Reception',
  lab: 'Lab',
  pharmacy: 'Pharmacy',
}

export const BILL_TYPES = ['opd', 'lab', 'pharmacy'] as const
export type BillType = (typeof BILL_TYPES)[number]
export const BILL_LABEL: Record<BillType, string> = { opd: 'OPD', lab: 'Lab', pharmacy: 'Pharmacy' }
export const BILL_ROLES: Record<BillType, Role[]> = {
  opd: ['owner', 'reception'],
  lab: ['owner', 'reception', 'lab'],
  pharmacy: ['owner', 'reception', 'pharmacy'],
}
export const billTypesFor = (role: Role) => BILL_TYPES.filter((t) => BILL_ROLES[t].includes(role))

export const PAY_MODES = ['cash', 'upi', 'card'] as const
export type PayMode = (typeof PAY_MODES)[number]

export const LAB_STATUS = ['pending', 'collected', 'ready'] as const
export const LAB_STATUS_LABEL = { pending: 'Sample pending', collected: 'Sample collected', ready: 'Report ready' }

export const EXPENSE_CATEGORIES = [
  'Salary',
  'Rent',
  'Electricity & water',
  'Medical supplies',
  'Pharmacy purchase',
  'Lab reagents',
  'Maintenance',
  'Housekeeping',
  'Marketing',
  'Other',
]

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const DEPT_ICONS = ['stethoscope', 'baby', 'bone', 'heart', 'ear', 'sparkles', 'siren', 'brain', 'eye', 'activity', 'microscope', 'pill']

export type Field = {
  key: string
  label: string
  type: 'text' | 'textarea' | 'money' | 'int' | 'select' | 'days' | 'time' | 'date'
  required?: boolean
  options?: readonly string[] | 'departments'
  max?: number
}
export type CatalogKind = 'departments' | 'doctors' | 'services' | 'lab_tests' | 'medicines'

export const CATALOG: Record<CatalogKind, { label: string; singular: string; fields: Field[] }> = {
  departments: {
    label: 'Departments',
    singular: 'department',
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'icon', label: 'Icon', type: 'select', options: DEPT_ICONS },
      { key: 'description', label: 'Description', type: 'textarea', max: 300 },
    ],
  },
  doctors: {
    label: 'Doctors',
    singular: 'doctor',
    fields: [
      { key: 'name', label: 'Full name', type: 'text', required: true },
      { key: 'department_id', label: 'Department', type: 'select', options: 'departments', required: true },
      { key: 'qualification', label: 'Qualification', type: 'text' },
      { key: 'fee', label: 'Consultation fee (₹)', type: 'money', required: true },
      { key: 'room', label: 'Room / cabin', type: 'text', max: 30 },
      { key: 'days', label: 'OPD days', type: 'days' },
      { key: 'start_time', label: 'OPD starts', type: 'time' },
      { key: 'end_time', label: 'OPD ends', type: 'time' },
      { key: 'max_tokens', label: 'Max tokens / day', type: 'int' },
      { key: 'bio', label: 'Short bio', type: 'textarea', max: 400 },
    ],
  },
  services: {
    label: 'OPD services',
    singular: 'service',
    fields: [
      { key: 'name', label: 'Service', type: 'text', required: true },
      { key: 'price', label: 'Price (₹)', type: 'money', required: true },
    ],
  },
  lab_tests: {
    label: 'Lab tests',
    singular: 'lab test',
    fields: [
      { key: 'name', label: 'Test name', type: 'text', required: true },
      { key: 'category', label: 'Category', type: 'text' },
      { key: 'price', label: 'Price (₹)', type: 'money', required: true },
      { key: 'tat', label: 'Report time', type: 'text', max: 40 },
    ],
  },
  medicines: {
    label: 'Medicines',
    singular: 'medicine',
    fields: [
      { key: 'name', label: 'Medicine', type: 'text', required: true },
      { key: 'batch', label: 'Batch', type: 'text', max: 40 },
      { key: 'expiry', label: 'Expiry', type: 'date' },
      { key: 'price', label: 'MRP per unit (₹)', type: 'money', required: true },
      { key: 'stock', label: 'Stock (units)', type: 'int' },
      { key: 'reorder_level', label: 'Reorder at', type: 'int' },
    ],
  },
}

export const SETTINGS_FIELDS = [
  { key: 'name', label: 'Hospital name' },
  { key: 'short', label: 'Short name (logo)' },
  { key: 'tagline', label: 'Tagline' },
  { key: 'about', label: 'About (landing page)' },
  { key: 'phone', label: 'Reception phone' },
  { key: 'emergency', label: 'Emergency phone' },
  { key: 'whatsapp', label: 'WhatsApp number' },
  { key: 'email', label: 'Email' },
  { key: 'address', label: 'Address' },
  { key: 'hours', label: 'OPD hours' },
  { key: 'map_url', label: 'Google Maps link' },
  { key: 'gstin', label: 'Reg. / GSTIN (printed on receipts)' },
] as const
