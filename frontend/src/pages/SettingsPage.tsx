import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Moon, Sun, Globe, Wifi, CloudOff, Save, Check, Lock,
  Stethoscope,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { Sidebar }    from '../components/ui/Sidebar'
import { Button }     from '../components/ui/Button'
import { Badge }      from '../components/ui/Badge'
import { Input }      from '../components/ui/Input'
import { useTheme }   from '../components/providers/ThemeProvider'
import { getUser }    from '../hooks/useAuth'
import { USER_PROFILE_UPDATED } from '../hooks/usePreferencesUser'
import { useToast }   from '../components/ui/Toaster'
import { cn }         from '../utils/cn'
import api            from '../lib/api'

const APP_LANGUAGE_KEY = 'audient_app_language'

const APP_LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'ur', label: 'Urdu' },
  { value: 'ar', label: 'Arabic' },
  { value: 'hi', label: 'Hindi' },
]

const PROCESSING_MODE_KEY = 'audient_processing_mode'

const SPECIALTY_OPTIONS = [
  { value: 'general_mbbs', label: 'General MBBS' },
  { value: 'general_practice', label: 'General Practice' },
  { value: 'cardiology', label: 'Cardiology' },
  { value: 'psychiatry', label: 'Psychiatry' },
  { value: 'paediatrics', label: 'Paediatrics' },
]

function readStoredPrefs(): { lang: string; mode: 'online' | 'offline' } {
  try {
    const lang = localStorage.getItem(APP_LANGUAGE_KEY) ?? 'en'
    const v = localStorage.getItem(PROCESSING_MODE_KEY)
    const mode = v === 'offline' ? 'offline' : 'online'
    return { lang, mode }
  } catch {
    return { lang: 'en', mode: 'online' }
  }
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 light:text-slate-500 mb-4">
      {children}
    </p>
  )
}

const fieldClass = cn(
  'h-12 w-full rounded-2xl pl-4 pr-4 text-sm appearance-none',
  'bg-black/20 light:bg-white border border-white/12 light:border-slate-200',
  'text-slate-100 light:text-slate-900',
  'focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-transparent',
)

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const user = getUser()
  const toast = useToast()

  const initial = useMemo(() => readStoredPrefs(), [])

  const [appLanguage, setAppLanguage] = useState(initial.lang)
  const [processingMode, setProcessingMode] = useState<'online' | 'offline'>(initial.mode)
  const [savedLocal, setSavedLocal] = useState(initial)

  const [specialty, setSpecialty] = useState(user?.specialty ?? 'general_mbbs')
  const [doctorTitle, setDoctorTitle] = useState(user?.doctor_title ?? '')
  const [clinicName, setClinicName] = useState(user?.clinic_name ?? '')
  const [licenseNumber, setLicenseNumber] = useState(user?.license_number ?? '')
  const [signatureUrl, setSignatureUrl] = useState(user?.signature_url ?? '')
  const [logoUrl, setLogoUrl] = useState(user?.logo_url ?? '')

  const [savedProfile, setSavedProfile] = useState({
    specialty: user?.specialty ?? 'general_mbbs',
    doctorTitle: user?.doctor_title ?? '',
    clinicName: user?.clinic_name ?? '',
    licenseNumber: user?.license_number ?? '',
    signatureUrl: user?.signature_url ?? '',
    logoUrl: user?.logo_url ?? '',
  })

  const [uploadingAsset, setUploadingAsset] = useState<'signature' | 'logo' | null>(null)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    api
      .get<{ preferences: Record<string, unknown> }>('/api/users/me/preferences')
      .then(res => {
        const pref = res.data?.preferences as {
          specialty?: string
          doctor_title?: string | null
          clinic_name?: string | null
          license_number?: string | null
          signature_url?: string | null
          logo_url?: string | null
        }
        if (!pref) return
        localStorage.setItem('auth', JSON.stringify(pref))
        setSpecialty(pref.specialty ?? 'general_mbbs')
        setDoctorTitle(pref.doctor_title ?? '')
        setClinicName(pref.clinic_name ?? '')
        setLicenseNumber(pref.license_number ?? '')
        setSignatureUrl(pref.signature_url ?? '')
        setLogoUrl(pref.logo_url ?? '')
        setSavedProfile({
          specialty: pref.specialty ?? 'general_mbbs',
          doctorTitle: pref.doctor_title ?? '',
          clinicName: pref.clinic_name ?? '',
          licenseNumber: pref.license_number ?? '',
          signatureUrl: pref.signature_url ?? '',
          logoUrl: pref.logo_url ?? '',
        })
      })
      .catch(() => {
        /* keep local snapshot */
      })
  }, [])

  const dirtyLocal =
    appLanguage !== savedLocal.lang || processingMode !== savedLocal.mode

  const dirtyProfile =
    specialty !== savedProfile.specialty ||
    doctorTitle !== savedProfile.doctorTitle ||
    clinicName !== savedProfile.clinicName ||
    licenseNumber !== savedProfile.licenseNumber

  const dirty = dirtyLocal || dirtyProfile

  const initialLetter = (user?.name?.trim()?.charAt(0) ?? '?').toUpperCase()

  const uploadAsset = useCallback(
    async (assetType: 'signature' | 'logo', file: File | null) => {
      if (!file) return
      const fd = new FormData()
      fd.append('asset_type', assetType)
      fd.append('file', file)

      setUploadingAsset(assetType)
      try {
        const res = await api.post<{ preferences: Record<string, unknown> }>(
          '/api/users/me/preferences/assets',
          fd,
          { headers: { 'Content-Type': 'multipart/form-data' } },
        )
        const updated = res.data?.preferences as {
          signature_url?: string | null
          logo_url?: string | null
        }
        if (updated) {
          localStorage.setItem('auth', JSON.stringify(res.data.preferences))
          setSignatureUrl(updated.signature_url ?? '')
          setLogoUrl(updated.logo_url ?? '')
          setSavedProfile(s => ({
            ...s,
            signatureUrl: updated.signature_url ?? s.signatureUrl,
            logoUrl: updated.logo_url ?? s.logoUrl,
          }))
          window.dispatchEvent(new Event(USER_PROFILE_UPDATED))
        }
        toast(`${assetType === 'signature' ? 'Signature' : 'Logo'} uploaded`, 'success')
      } catch (err: unknown) {
        const msg =
          err && typeof err === 'object' && 'response' in err
            ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
            : undefined
        toast(msg || 'Upload failed', 'error')
      } finally {
        setUploadingAsset(null)
      }
    },
    [toast],
  )

  const handleSave = async () => {
    setSaving(true)
    try {
      if (dirtyProfile) {
        const res = await api.patch('/api/users/me/preferences', {
          specialty,
          doctor_title: doctorTitle,
          clinic_name: clinicName,
          license_number: licenseNumber,
        })
        const updated = res.data?.preferences
        if (updated) {
          localStorage.setItem('auth', JSON.stringify(updated))
          const u = updated as {
            specialty?: string
            doctor_title?: string | null
            clinic_name?: string | null
            license_number?: string | null
            signature_url?: string | null
            logo_url?: string | null
          }
          setSavedProfile({
            specialty: u.specialty ?? specialty,
            doctorTitle: u.doctor_title ?? '',
            clinicName: u.clinic_name ?? '',
            licenseNumber: u.license_number ?? '',
            signatureUrl: u.signature_url ?? signatureUrl,
            logoUrl: u.logo_url ?? logoUrl,
          })
          window.dispatchEvent(new Event(USER_PROFILE_UPDATED))
        }
      }

      if (dirtyLocal) {
        localStorage.setItem(APP_LANGUAGE_KEY, appLanguage)
        localStorage.setItem(PROCESSING_MODE_KEY, processingMode)
        setSavedLocal({ lang: appLanguage, mode: processingMode })
      }

      toast('Settings saved', 'success')
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2000)
    } catch {
      toast('Could not save settings', 'error')
    } finally {
      setSaving(false)
    }
  }

  const panelShell = cn(
    'rounded-3xl overflow-hidden h-full',
    'border border-white/10 light:border-slate-200/80',
    'bg-surface-50/75 light:bg-white/90',
    'backdrop-blur-xl shadow-glow-lg light:shadow-soft',
    'ring-1 ring-inset ring-white/5 light:ring-slate-200/60',
  )

  const divider = (
    <div className="h-px bg-gradient-to-r from-transparent via-white/12 to-transparent light:via-slate-200/80" />
  )

  return (
    <div className="app-page">
      <Sidebar />

      <main className="relative flex-1 flex flex-col min-h-0 overflow-hidden light:bg-slate-100">
        <div
          className="pointer-events-none absolute inset-0 bg-glow-radial opacity-90"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-grid-dots bg-grid opacity-[0.35] light:opacity-[0.12]"
          aria-hidden
        />

        <div className="relative flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 md:py-16 pb-28">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <header className="mb-10 text-center md:text-left">
                <h1 className="font-display font-bold text-3xl text-white light:text-slate-900 tracking-tight">
                  Settings
                </h1>
                <p className="text-sm text-slate-400 light:text-slate-600 mt-1.5 max-w-2xl">
                  App preferences and your professional profile for notes and exports.
                </p>
              </header>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-stretch">
                {/* Column: App */}
                <div className={panelShell}>
                  <section className="px-6 sm:px-8 pt-8 pb-7">
                    <SectionLabel>Account</SectionLabel>
                    <div className="flex items-center gap-4">
                      <div
                        className={cn(
                          'h-14 w-14 shrink-0 rounded-2xl flex items-center justify-center text-lg font-bold text-white',
                          'bg-gradient-to-br from-brand-500/50 to-violet-600/35',
                          'border border-white/15 shadow-inner-glow',
                        )}
                        aria-hidden
                      >
                        {initialLetter}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-semibold text-white light:text-slate-900 truncate">
                          {user?.name ?? '—'}
                        </p>
                        <p className="text-sm text-slate-500 light:text-slate-600 truncate mt-0.5">
                          {user?.email ?? ''}
                        </p>
                      </div>
                      <Badge variant={user?.role === 'admin' ? 'warning' : 'default'} dot className="shrink-0">
                        {user?.role ?? 'healthcare'}
                      </Badge>
                    </div>
                  </section>

                  {divider}

                  <section className="px-6 sm:px-8 py-7">
                    <SectionLabel>Appearance</SectionLabel>
                    <p className="text-sm text-slate-400 light:text-slate-600 mb-4">
                      Color theme updates instantly.
                    </p>
                    <div
                      className={cn(
                        'flex rounded-2xl p-1.5 gap-1.5',
                        'bg-black/25 light:bg-slate-100',
                        'ring-1 ring-inset ring-white/10 light:ring-slate-200/80',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setTheme('dark')}
                        className={cn(
                          'flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-all duration-200',
                          theme === 'dark'
                            ? 'bg-brand-500/25 text-white shadow-inner-glow border border-brand-400/30'
                            : 'text-slate-400 hover:text-slate-200 light:hover:text-slate-700 light:text-slate-500',
                        )}
                      >
                        <Moon size={16} className={theme === 'dark' ? 'text-brand-300' : 'opacity-70'} />
                        Dark
                      </button>
                      <button
                        type="button"
                        onClick={() => setTheme('light')}
                        className={cn(
                          'flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-all duration-200',
                          theme === 'light'
                            ? 'bg-amber-400/15 text-slate-900 light:bg-white light:shadow-sm border border-amber-400/25'
                            : 'text-slate-400 hover:text-slate-200 light:hover:text-slate-700 light:text-slate-500',
                        )}
                      >
                        <Sun size={16} className={theme === 'light' ? 'text-amber-500' : 'opacity-70'} />
                        Light
                      </button>
                    </div>
                  </section>

                  {divider}

                  <section className="px-6 sm:px-8 py-7">
                    <SectionLabel>Processing</SectionLabel>
                    <p className="text-sm text-slate-400 light:text-slate-600 mb-4 leading-relaxed">
                      Online uses cloud processing. Offline keeps data on your network — coming later.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setProcessingMode('online')}
                        className={cn(
                          'group relative flex flex-col items-start gap-3 rounded-2xl border p-4 text-left transition-all duration-200',
                          processingMode === 'online'
                            ? 'border-brand-500/50 bg-brand-500/10 shadow-[0_0_0_1px_rgba(99,102,241,0.2)]'
                            : 'border-white/10 bg-white/[0.03] hover:border-white/18 hover:bg-white/[0.05] light:border-slate-200 light:bg-slate-50/80',
                        )}
                      >
                        <span
                          className={cn(
                            'inline-flex h-9 w-9 items-center justify-center rounded-xl',
                            processingMode === 'online'
                              ? 'bg-brand-500/25 text-brand-300'
                              : 'bg-white/6 text-slate-400 group-hover:text-slate-300 light:bg-slate-200/80',
                          )}
                        >
                          <Wifi size={18} strokeWidth={2} />
                        </span>
                        <span>
                          <span className="block text-sm font-semibold text-white light:text-slate-900">Online</span>
                          <span className="block text-[11px] text-slate-500 mt-0.5">Cloud · default</span>
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled
                        title="Coming soon"
                        className={cn(
                          'relative flex flex-col items-start gap-3 rounded-2xl border p-4 text-left',
                          'border-white/8 bg-white/[0.02] opacity-60 cursor-not-allowed',
                          'light:border-slate-200/60 light:bg-slate-50/50',
                        )}
                      >
                        <span className="absolute top-3 right-3 text-[10px] font-medium uppercase tracking-wide text-slate-500 flex items-center gap-1">
                          <Lock size={10} />
                          Soon
                        </span>
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/6 text-slate-500 light:bg-slate-200/60">
                          <CloudOff size={18} strokeWidth={2} />
                        </span>
                        <span>
                          <span className="block text-sm font-semibold text-slate-500 light:text-slate-600">Offline</span>
                          <span className="block text-[11px] text-slate-600 mt-0.5">Local processing</span>
                        </span>
                      </button>
                    </div>
                  </section>

                  {divider}

                  <section className="px-6 sm:px-8 py-7">
                    <SectionLabel>Language</SectionLabel>
                    <p className="text-sm text-slate-400 light:text-slate-600 mb-4">
                      Interface language.
                    </p>
                    <div className="relative">
                      <Globe
                        size={17}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none z-10"
                        aria-hidden
                      />
                      <select
                        value={appLanguage}
                        onChange={e => setAppLanguage(e.target.value)}
                        className={cn(fieldClass, 'pl-11 pr-10 cursor-pointer')}
                      >
                        {APP_LANGUAGES.map(opt => (
                          <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-100">
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    </div>
                  </section>
                </div>

                {/* Column: Professional profile */}
                <div className={panelShell}>
                  <section className="px-6 sm:px-8 pt-8 pb-7">
                    <div className="flex items-center gap-2 mb-4">
                      <Stethoscope size={18} className="text-brand-400 shrink-0" />
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Professional profile
                      </p>
                    </div>
                    <p className="text-sm text-slate-400 light:text-slate-600 mb-6 leading-relaxed">
                      Specialty shapes AI extraction and templates. Title and clinic appear on exports. Signature and logo are optional branding.
                    </p>

                    <div className="space-y-5">
                      <div>
                        <label className="block text-xs font-medium text-slate-400 light:text-slate-600 mb-2">
                          Specialty
                        </label>
                        <select
                          value={specialty}
                          onChange={e => setSpecialty(e.target.value)}
                          className={fieldClass}
                        >
                          {SPECIALTY_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value} className="bg-slate-900">
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Input
                          label="Doctor title"
                          value={doctorTitle}
                          onChange={e => setDoctorTitle(e.target.value)}
                          placeholder="e.g. Consultant Cardiologist"
                        />
                        <Input
                          label="Clinic name"
                          value={clinicName}
                          onChange={e => setClinicName(e.target.value)}
                          placeholder="e.g. City Care Clinic"
                        />
                      </div>

                      <Input
                        label="License number"
                        value={licenseNumber}
                        onChange={e => setLicenseNumber(e.target.value)}
                        placeholder="Medical license / registration"
                      />

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-1">
                        <div>
                          <label className="block text-xs font-medium text-slate-400 light:text-slate-600 mb-2">
                            Signature (png/jpg/webp, max 2MB)
                          </label>
                          {signatureUrl && (
                            <img
                              src={signatureUrl}
                              alt="Signature preview"
                              className="mb-2 max-h-16 rounded-lg border border-white/10 light:border-slate-200 bg-white/5 object-contain p-1"
                            />
                          )}
                          <input
                            type="file"
                            accept=".png,.jpg,.jpeg,.webp"
                            onChange={e => uploadAsset('signature', e.target.files?.[0] ?? null)}
                            className="block w-full text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-500/20 file:px-3 file:py-2 file:text-slate-100"
                          />
                          {!signatureUrl && (
                            <p className="text-[11px] text-slate-600 mt-1.5">No signature uploaded.</p>
                          )}
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-400 light:text-slate-600 mb-2">
                            Clinic logo (png/jpg/webp, max 2MB)
                          </label>
                          {logoUrl && (
                            <img
                              src={logoUrl}
                              alt="Clinic logo preview"
                              className="mb-2 max-h-16 rounded-lg border border-white/10 light:border-slate-200 bg-white/5 object-contain p-1"
                            />
                          )}
                          <input
                            type="file"
                            accept=".png,.jpg,.jpeg,.webp"
                            onChange={e => uploadAsset('logo', e.target.files?.[0] ?? null)}
                            className="block w-full text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-500/20 file:px-3 file:py-2 file:text-slate-100"
                          />
                          {!logoUrl && (
                            <p className="text-[11px] text-slate-600 mt-1.5">No logo uploaded.</p>
                          )}
                        </div>
                      </div>

                      {uploadingAsset && (
                        <p className="text-xs text-slate-500">Uploading {uploadingAsset}…</p>
                      )}
                    </div>
                  </section>
                </div>
              </div>

              {/* Save — full width under grid */}
              <div
                className={cn(
                  'mt-6 rounded-3xl overflow-hidden',
                  'border border-white/10 light:border-slate-200/80',
                  'bg-surface-50/75 light:bg-white/90',
                  'backdrop-blur-xl shadow-glow-lg light:shadow-soft',
                  'ring-1 ring-inset ring-white/5 light:ring-slate-200/60',
                  'px-6 sm:px-8 py-6',
                  'bg-black/15 light:bg-slate-50/90',
                )}
              >
                <Button
                  className="w-full max-w-md mx-auto flex"
                  size="lg"
                  disabled={!dirty}
                  loading={saving}
                  glow={justSaved}
                  onClick={handleSave}
                >
                  {justSaved ? (
                    <>
                      <Check size={17} strokeWidth={2.5} />
                      Saved
                    </>
                  ) : (
                    <>
                      <Save size={17} />
                      Save changes
                    </>
                  )}
                </Button>
                <p className="text-center text-[11px] text-slate-500 light:text-slate-500 mt-3 max-w-lg mx-auto">
                  {dirty
                    ? 'Unsaved changes to profile fields, language, or processing mode.'
                    : 'Theme and uploaded images save immediately. Nothing else pending.'}
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  )
}
