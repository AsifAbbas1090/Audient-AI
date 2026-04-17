import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Sidebar } from '../components/ui/Sidebar'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { useToast } from '../components/ui/Toaster'
import api from '../lib/api'
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Save, ScanEye, Upload } from 'lucide-react'

type Purpose = 'clinical' | 'patient_facing'

type Section = {
  id: string
  label: string
  source_key: string
  visible: boolean
}

export type PdfTheme = {
  layout: string
}

type SchemaJson = {
  sections: Section[]
  theme: PdfTheme
}

type TemplateState = {
  id: string
  name: string
  schema_json: SchemaJson
  active_version_id: string | null
}

// Backward-compat: maps old preset names to new layout IDs
const _PRESET_TO_LAYOUT: Record<string, string> = {
  minimal_clinical:    'minimal_clean',
  rx_pad_classic:      'classic_blue',
  teal_healthcare:     'teal_rx_pad',
  navy_diagnostician:  'navy_letterhead',
  emerald_clinic:      'emerald_sidebar',
  burgundy_specialist: 'burgundy_specialist',
}

const VALID_LAYOUTS = new Set([
  'teal_rx_pad', 'navy_letterhead', 'emerald_sidebar',
  'classic_blue', 'burgundy_specialist', 'minimal_clean',
])

const DEFAULT_THEME: PdfTheme = { layout: 'teal_rx_pad' }

// ── Visual card definitions ───────────────────────────────────────────────────

type LayoutCard = {
  id: string
  label: string
  description: string
  preview: React.ReactNode
}

const LAYOUT_CARDS: LayoutCard[] = [
  {
    id: 'teal_rx_pad',
    label: 'Teal Rx Pad',
    description: 'Classic teal prescription-pad with full-width banner and Rx symbol',
    preview: (
      <div style={{ width: 72, height: 90, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 3, overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
        {/* Teal banner */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 27, background: '#0d9488' }} />
        <div style={{ position: 'absolute', top: 24, left: 0, right: 0, height: 3, background: '#0f766e' }} />
        {/* Rx */}
        <div style={{ position: 'absolute', top: 4, left: 5, color: '#ccfbf1', fontWeight: 'bold', fontSize: 13, fontFamily: 'serif', lineHeight: 1 }}>Rx</div>
        {/* Name line */}
        <div style={{ position: 'absolute', top: 6, left: 22, right: 5, height: 3, background: 'rgba(255,255,255,0.75)', borderRadius: 1 }} />
        <div style={{ position: 'absolute', top: 12, left: 22, right: 10, height: 2.5, background: 'rgba(255,255,255,0.45)', borderRadius: 1 }} />
        <div style={{ position: 'absolute', top: 18, left: 22, right: 14, height: 2.5, background: 'rgba(255,255,255,0.45)', borderRadius: 1 }} />
        {/* Rule */}
        <div style={{ position: 'absolute', top: 31, left: 5, right: 5, height: 1.5, background: '#5eead4', borderRadius: 1 }} />
        {/* Content lines */}
        {[36,41,46,51,56,61].map(t => (
          <div key={t} style={{ position: 'absolute', top: t, left: 5, right: [15,8,20,12,18,10][Math.floor((t-36)/5)], height: 2, background: '#e5e7eb', borderRadius: 1 }} />
        ))}
        {/* Footer bar */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 9, background: '#f0fdfa', borderTop: '1px solid #5eead4' }} />
      </div>
    ),
  },
  {
    id: 'navy_letterhead',
    label: 'Navy Letterhead',
    description: 'Deep navy formal letterhead — ideal for hospital specialists',
    preview: (
      <div style={{ width: 72, height: 90, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 3, overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
        {/* Navy banner */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 32, background: '#1e3a8a' }} />
        {/* Gold separator */}
        <div style={{ position: 'absolute', top: 32, left: 0, right: 0, height: 2.5, background: '#fbbf24' }} />
        {/* Faint Rx watermark */}
        <div style={{ position: 'absolute', top: 8, right: 4, color: '#1e40af', fontWeight: 'bold', fontSize: 16, fontFamily: 'serif', opacity: 0.5, lineHeight: 1 }}>Rx</div>
        {/* Name lines */}
        <div style={{ position: 'absolute', top: 6, left: 6, right: 18, height: 4, background: 'rgba(255,255,255,0.8)', borderRadius: 1 }} />
        <div style={{ position: 'absolute', top: 13, left: 6, right: 22, height: 2.5, background: 'rgba(191,219,254,0.7)', borderRadius: 1 }} />
        <div style={{ position: 'absolute', top: 20, left: 6, right: 26, height: 2.5, background: 'rgba(255,255,255,0.5)', borderRadius: 1 }} />
        <div style={{ position: 'absolute', top: 27, left: 6, right: 30, height: 2, background: 'rgba(191,219,254,0.5)', borderRadius: 1 }} />
        {/* Content lines */}
        {[38,43,48,53,58,63].map(t => (
          <div key={t} style={{ position: 'absolute', top: t, left: 5, right: [8,15,10,20,12,18][Math.floor((t-38)/5)], height: 2, background: '#e5e7eb', borderRadius: 1 }} />
        ))}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 9, background: '#eff6ff', borderTop: '1px solid #93c5fd' }} />
      </div>
    ),
  },
  {
    id: 'emerald_sidebar',
    label: 'Emerald Sidebar',
    description: 'Modern emerald full-height left sidebar — striking clinic style',
    preview: (
      <div style={{ width: 72, height: 90, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 3, overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
        {/* Emerald sidebar */}
        <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 18, background: '#059669' }} />
        <div style={{ position: 'absolute', top: 0, left: 17, bottom: 0, width: 1.5, background: '#047857' }} />
        {/* Sidebar text hints (rotated feel) */}
        <div style={{ position: 'absolute', top: 16, left: 2, width: 14, height: 2.5, background: 'rgba(255,255,255,0.7)', borderRadius: 1 }} />
        <div style={{ position: 'absolute', top: 21, left: 3, width: 12, height: 2, background: 'rgba(167,243,208,0.6)', borderRadius: 1 }} />
        <div style={{ position: 'absolute', top: 38, left: 4, width: 10, height: 2, background: 'rgba(167,243,208,0.4)', borderRadius: 1 }} />
        <div style={{ position: 'absolute', top: 44, left: 4, width: 10, height: 2, background: 'rgba(167,243,208,0.4)', borderRadius: 1 }} />
        <div style={{ position: 'absolute', top: 50, left: 4, width: 10, height: 2, background: 'rgba(167,243,208,0.4)', borderRadius: 1 }} />
        {/* Logo circle placeholder */}
        <div style={{ position: 'absolute', top: 5, left: 4, width: 10, height: 10, background: 'rgba(255,255,255,0.2)', borderRadius: '50%' }} />
        {/* Top accent line */}
        <div style={{ position: 'absolute', top: 0, left: 18, right: 0, height: 3, background: '#059669' }} />
        {/* Content area */}
        {[8,14,20,26,32,38].map(t => (
          <div key={t} style={{ position: 'absolute', top: t, left: 22, right: [8,14,5,18,10,15][Math.floor((t-8)/6)], height: 2, background: '#e5e7eb', borderRadius: 1 }} />
        ))}
        <div style={{ position: 'absolute', bottom: 0, left: 18, right: 0, height: 9, background: '#ecfdf5', borderTop: '1px solid #6ee7b7' }} />
      </div>
    ),
  },
  {
    id: 'classic_blue',
    label: 'Classic Blue',
    description: 'Classic sky-blue prescription pad with two-tone banner and Rx symbol',
    preview: (
      <div style={{ width: 72, height: 90, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 3, overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
        {/* Main blue banner */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 22, background: '#0369a1' }} />
        {/* Light blue stripe */}
        <div style={{ position: 'absolute', top: 22, left: 0, right: 0, height: 6, background: '#38bdf8' }} />
        {/* Rx in stripe */}
        <div style={{ position: 'absolute', top: 22, left: 5, color: '#0369a1', fontWeight: 'bold', fontSize: 8, fontFamily: 'serif', lineHeight: '6px' }}>Rx</div>
        {/* Name lines */}
        <div style={{ position: 'absolute', top: 5, left: 5, right: 15, height: 3.5, background: 'rgba(255,255,255,0.8)', borderRadius: 1 }} />
        <div style={{ position: 'absolute', top: 11, left: 5, right: 22, height: 2.5, background: 'rgba(224,242,254,0.7)', borderRadius: 1 }} />
        <div style={{ position: 'absolute', top: 17, left: 5, right: 18, height: 2.5, background: 'rgba(255,255,255,0.55)', borderRadius: 1 }} />
        {/* Content */}
        {[33,38,43,48,53,58].map(t => (
          <div key={t} style={{ position: 'absolute', top: t, left: 5, right: [10,18,8,22,14,16][Math.floor((t-33)/5)], height: 2, background: '#e5e7eb', borderRadius: 1 }} />
        ))}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 9, background: '#f0f9ff', borderTop: '1px solid #7dd3fc' }} />
      </div>
    ),
  },
  {
    id: 'burgundy_specialist',
    label: 'Burgundy Specialist',
    description: 'Formal burgundy letterhead — surgical and specialist practices',
    preview: (
      <div style={{ width: 72, height: 90, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 3, overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
        {/* Dark upper band */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 28, background: '#7f1d1d' }} />
        {/* Ornamental rule */}
        <div style={{ position: 'absolute', top: 28, left: 0, right: 0, height: 2, background: '#9f1239' }} />
        {/* Rose lower band */}
        <div style={{ position: 'absolute', top: 30, left: 0, right: 0, height: 7, background: '#fff1f2' }} />
        {/* Thin inner line */}
        <div style={{ position: 'absolute', top: 3, left: 5, right: 5, height: 0.5, background: '#9f1239', opacity: 0.4 }} />
        {/* Name lines */}
        <div style={{ position: 'absolute', top: 7, left: 5, right: 14, height: 4, background: 'rgba(255,255,255,0.8)', borderRadius: 1 }} />
        <div style={{ position: 'absolute', top: 14, left: 5, right: 22, height: 2.5, background: 'rgba(254,205,211,0.7)', borderRadius: 1 }} />
        <div style={{ position: 'absolute', top: 20, left: 5, right: 28, height: 2, background: 'rgba(254,205,211,0.5)', borderRadius: 1 }} />
        {/* Clinic in rose band */}
        <div style={{ position: 'absolute', top: 32, left: 5, right: 30, height: 3, background: '#fda4af', borderRadius: 1 }} />
        {/* Content */}
        {[42,47,52,57,62,67].map(t => (
          <div key={t} style={{ position: 'absolute', top: t, left: 5, right: [10,18,8,22,14,16][Math.floor((t-42)/5)], height: 2, background: '#e5e7eb', borderRadius: 1 }} />
        ))}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 9, background: '#fff1f2', borderTop: '1px solid #fda4af' }} />
      </div>
    ),
  },
  {
    id: 'minimal_clean',
    label: 'Minimal Clean',
    description: 'Clean gray — compact clinical record, no decorative elements',
    preview: (
      <div style={{ width: 72, height: 90, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 3, overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
        {/* Thin top strip */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#374151' }} />
        {/* Name lines (dark ink, no background) */}
        <div style={{ position: 'absolute', top: 8, left: 5, right: 18, height: 3.5, background: '#374151', borderRadius: 1, opacity: 0.75 }} />
        <div style={{ position: 'absolute', top: 15, left: 5, right: 26, height: 2.5, background: '#6b7280', borderRadius: 1, opacity: 0.5 }} />
        <div style={{ position: 'absolute', top: 21, left: 5, right: 30, height: 2, background: '#374151', borderRadius: 1, opacity: 0.35 }} />
        {/* Rule below header */}
        <div style={{ position: 'absolute', top: 27, left: 5, right: 5, height: 0.75, background: '#374151', opacity: 0.35 }} />
        {/* Content */}
        {[32,38,44,50,56,62].map(t => (
          <div key={t} style={{ position: 'absolute', top: t, left: 5, right: [10,18,8,22,14,16][Math.floor((t-32)/6)], height: 2, background: '#d1d5db', borderRadius: 1 }} />
        ))}
        {/* Left tinted labels */}
        <div style={{ position: 'absolute', top: 32, left: 5, width: 14, height: 6, background: '#f9fafb', borderLeft: '2px solid #374151', borderRadius: '0 1px 1px 0' }} />
        <div style={{ position: 'absolute', top: 42, left: 5, width: 14, height: 6, background: '#f9fafb', borderLeft: '2px solid #374151', borderRadius: '0 1px 1px 0' }} />
        <div style={{ position: 'absolute', top: 52, left: 5, width: 14, height: 6, background: '#f9fafb', borderLeft: '2px solid #374151', borderRadius: '0 1px 1px 0' }} />
      </div>
    ),
  },
]

function normalizeSchema(raw: unknown): SchemaJson {
  const o = raw as Record<string, unknown> | null
  const sections = Array.isArray(o?.sections) ? (o!.sections as Section[]) : []
  const t = o?.theme as Record<string, unknown> | undefined

  let layout = DEFAULT_THEME.layout
  if (typeof t?.layout === 'string' && VALID_LAYOUTS.has(t.layout)) {
    layout = t.layout
  } else if (typeof t?.preset === 'string') {
    // Backward compat: map old preset to new layout
    layout = _PRESET_TO_LAYOUT[t.preset as string] ?? DEFAULT_THEME.layout
  }
  return { sections, theme: { layout } }
}

function purposeFromSearch(raw: string | null): Purpose {
  return raw === 'patient_facing' ? 'patient_facing' : 'clinical'
}

export default function TemplateBuilderPage() {
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const purpose = purposeFromSearch(searchParams.get('purpose'))

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [template, setTemplate] = useState<TemplateState | null>(null)
  const [versions, setVersions] = useState<any[]>([])

  const purposeQuery = useMemo(() => `?purpose=${encodeURIComponent(purpose)}`, [purpose])

  useEffect(() => {
    setLoading(true)
    api
      .get(`/api/templates/me${purposeQuery}`)
      .then(res => {
        const t = res.data.template as TemplateState
        setTemplate({
          ...t,
          schema_json: normalizeSchema(t.schema_json),
        })
        setVersions(res.data.versions || [])
      })
      .catch(() => toast('Could not load template', 'error'))
      .finally(() => setLoading(false))
  }, [purpose, purposeQuery])

  const setPurposeTab = (next: Purpose) => {
    if (next === 'clinical') {
      setSearchParams({}, { replace: true })
    } else {
      setSearchParams({ purpose: 'patient_facing' }, { replace: true })
    }
  }

  const sections = useMemo(() => template?.schema_json?.sections ?? [], [template])
  const theme = template?.schema_json?.theme ?? DEFAULT_THEME

  const patchSchema = (fn: (s: SchemaJson) => SchemaJson) => {
    setTemplate(prev => {
      if (!prev) return prev
      const base = normalizeSchema(prev.schema_json)
      return { ...prev, schema_json: fn(base) }
    })
  }

  const setSections = (next: Section[]) => {
    patchSchema(s => ({ ...s, sections: next }))
  }

  const setLayout = (layout: string) => {
    patchSchema(s => ({ ...s, theme: { layout } }))
  }

  const move = (index: number, dir: -1 | 1) => {
    const next = [...sections]
    const to = index + dir
    if (to < 0 || to >= next.length) return
    const [item] = next.splice(index, 1)
    next.splice(to, 0, item)
    setSections(next)
  }

  const updateSection = (index: number, patch: Partial<Section>) => {
    const next = [...sections]
    next[index] = { ...next[index], ...patch }
    setSections(next)
  }

  const addSection = () => {
    const id = `custom_${Date.now()}`
    setSections([
      ...sections,
      { id, label: 'Custom Section', source_key: '', visible: true },
    ])
  }

  const removeSection = (index: number) => {
    const next = [...sections]
    next.splice(index, 1)
    setSections(next)
  }

  const saveDraft = async () => {
    if (!template) return
    setSaving(true)
    try {
      const res = await api.patch(`/api/templates/me/draft${purposeQuery}`, {
        name: template.name,
        schema_json: template.schema_json,
      })
      setTemplate({
        ...res.data.template,
        schema_json: normalizeSchema(res.data.template.schema_json),
      })
      toast('Template draft saved', 'success')
    } catch (err: any) {
      toast(err?.response?.data?.error || 'Could not save draft', 'error')
    } finally {
      setSaving(false)
    }
  }

  const previewPdf = async () => {
    if (!template) return
    setPreviewing(true)
    try {
      const res = await api.post(
        `/api/templates/me/preview-pdf${purposeQuery}`,
        { schema_json: template.schema_json },
        { responseType: 'blob' },
      )
      const url = URL.createObjectURL(res.data as Blob)
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(url), 120_000)
      toast('Preview opened in a new tab (sample data)', 'success')
    } catch (err: any) {
      let msg = 'Could not generate preview'
      const data = err?.response?.data
      if (data instanceof Blob) {
        try {
          const t = await data.text()
          const j = JSON.parse(t) as { error?: string }
          if (j?.error) msg = j.error
        } catch {
          /* ignore */
        }
      } else if (err?.response?.data?.error) {
        msg = err.response.data.error
      }
      toast(msg, 'error')
    } finally {
      setPreviewing(false)
    }
  }

  const publish = async () => {
    setPublishing(true)
    try {
      const res = await api.post(`/api/templates/me/publish${purposeQuery}`)
      setTemplate({
        ...res.data.template,
        schema_json: normalizeSchema(res.data.template.schema_json),
      })
      setVersions(prev => [res.data.published_version, ...prev])
      toast('Published new template version', 'success')
    } catch (err: any) {
      toast(err?.response?.data?.error || 'Could not publish template', 'error')
    } finally {
      setPublishing(false)
    }
  }

  const activateVersion = async (versionId: string) => {
    try {
      const res = await api.post(`/api/templates/me/activate/${versionId}${purposeQuery}`)
      setTemplate(prev =>
        prev ? { ...prev, active_version_id: res.data.active_version.id } : prev,
      )
      toast('Template version activated', 'success')
    } catch {
      toast('Could not activate version', 'error')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex bg-surface-400">
        <Sidebar />
        <main className="flex-1 p-6 text-slate-400">Loading template…</main>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex bg-surface-400">
      <Sidebar />
      <main className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-5">
          <Card variant="elevated" className="p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h1 className="text-white font-semibold text-lg">Template Builder</h1>
                <p className="text-xs text-slate-500 mt-1">
                  Clinical and patient-facing layouts are versioned separately. Session PDFs lock to the versions active when
                  each visit was finalized. Section labels for <em>new</em> accounts follow your specialty from Settings; you
                  can rename or reorder anything here.
                </p>
              </div>
              <div className="flex rounded-xl border border-white/10 p-0.5 bg-white/4">
                <button
                  type="button"
                  onClick={() => setPurposeTab('clinical')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    purpose === 'clinical'
                      ? 'bg-brand-500/20 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Clinical note
                </button>
                <button
                  type="button"
                  onClick={() => setPurposeTab('patient_facing')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    purpose === 'patient_facing'
                      ? 'bg-brand-500/20 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Patient-facing
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-[11px] text-slate-500 uppercase tracking-wide">
                Editing:{' '}
                <span className="text-slate-300">{purpose === 'clinical' ? 'clinical' : 'patient_facing'}</span>
              </div>
              <div className="flex flex-wrap gap-2 justify-end">
                <Button size="sm" variant="secondary" onClick={saveDraft} loading={saving}>
                  <Save size={13} /> Save Draft
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={previewPdf}
                  loading={previewing}
                  disabled={!template?.schema_json?.sections?.length}
                  title="Open a sample PDF with your current layout and sections (unsaved edits included)"
                >
                  <ScanEye size={13} /> Preview PDF
                </Button>
                <Button size="sm" onClick={publish} loading={publishing}>
                  <Upload size={13} /> Publish Version
                </Button>
              </div>
            </div>
            <Input
              label="Template name"
              value={template?.name ?? ''}
              onChange={e => setTemplate(prev => (prev ? { ...prev, name: e.target.value } : prev))}
            />
          </Card>

          {/* ── PDF Layout picker ─────────────────────────────────────── */}
          <Card variant="elevated" className="p-5 space-y-4">
            <div>
              <h2 className="text-white font-medium">PDF Letterhead Design</h2>
              <p className="text-[11px] text-slate-500 mt-1">
                Choose a professional letterhead style. Your clinic name, doctor details, and logo from your profile
                auto-fill into the selected design. Click any template to select it, then preview to see the result.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {LAYOUT_CARDS.map(card => {
                const isSelected = theme.layout === card.id
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => setLayout(card.id)}
                    className={`flex flex-col items-center gap-2.5 rounded-xl p-3 border transition-all text-left cursor-pointer ${
                      isSelected
                        ? 'border-brand-500/60 bg-brand-500/10 ring-1 ring-brand-500/40'
                        : 'border-white/10 bg-white/4 hover:border-white/20 hover:bg-white/6'
                    }`}
                  >
                    {/* Mini A4 preview */}
                    <div className={`transition-transform ${isSelected ? 'scale-105' : ''}`}>
                      {card.preview}
                    </div>
                    <div className="w-full">
                      <div className={`text-xs font-medium leading-snug ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                        {card.label}
                        {isSelected && (
                          <span className="ml-1.5 text-[10px] text-brand-400 font-normal">✓ selected</span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5 leading-snug">{card.description}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </Card>

          {/* ── Sections ─────────────────────────────────────────────── */}
          <Card variant="elevated" className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-medium">Sections</h2>
              <Button size="sm" variant="secondary" onClick={addSection}>
                <Plus size={13} /> Add Section
              </Button>
            </div>
            {sections.map((s, i) => (
              <div
                key={s.id}
                className="grid grid-cols-12 gap-2 items-center bg-white/4 border border-white/10 rounded-xl p-3"
              >
                <div className="col-span-4">
                  <Input
                    value={s.label}
                    onChange={e => updateSection(i, { label: e.target.value })}
                    placeholder="Section label"
                  />
                </div>
                <div className="col-span-4">
                  <Input
                    value={s.source_key}
                    onChange={e => updateSection(i, { source_key: e.target.value })}
                    placeholder="source_key (e.g. disease)"
                  />
                </div>
                <div className="col-span-4 flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => updateSection(i, { visible: !s.visible })}>
                    {s.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => move(i, -1)}>
                    <ArrowUp size={13} />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => move(i, 1)}>
                    <ArrowDown size={13} />
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => removeSection(i)}>
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </Card>

          {/* ── Version history ─────────────────────────────────────── */}
          <Card variant="elevated" className="p-5">
            <h2 className="text-white font-medium mb-3">Version History</h2>
            <div className="space-y-2">
              {versions.map(v => (
                <div
                  key={v.id}
                  className="flex items-center justify-between bg-white/4 border border-white/10 rounded-xl px-3 py-2"
                >
                  <div className="text-sm text-slate-200">
                    v{v.version_number} · {new Date(v.created_at).toLocaleString()}
                  </div>
                  <Button
                    size="sm"
                    variant={template?.active_version_id === v.id ? 'primary' : 'secondary'}
                    onClick={() => activateVersion(v.id)}
                    disabled={template?.active_version_id === v.id}
                  >
                    {template?.active_version_id === v.id ? 'Active' : 'Activate'}
                  </Button>
                </div>
              ))}
            </div>
          </Card>

          <p className="text-center text-xs text-slate-600">
            <Link to="/app" className="text-slate-500 hover:text-slate-400">
              ← Back to sessions
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
