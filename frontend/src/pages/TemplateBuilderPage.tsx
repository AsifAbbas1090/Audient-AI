import { useEffect, useMemo, useState } from 'react'
import { Sidebar } from '../components/ui/Sidebar'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { useToast } from '../components/ui/Toaster'
import api from '../lib/api'
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Save, Upload } from 'lucide-react'

type Section = {
  id: string
  label: string
  source_key: string
  visible: boolean
}

type TemplateState = {
  id: string
  name: string
  schema_json: {
    sections: Section[]
  }
  active_version_id: string | null
}

export default function TemplateBuilderPage() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [template, setTemplate] = useState<TemplateState | null>(null)
  const [versions, setVersions] = useState<any[]>([])

  useEffect(() => {
    api.get('/api/templates/me')
      .then(res => {
        setTemplate(res.data.template)
        setVersions(res.data.versions || [])
      })
      .catch(() => toast('Could not load template', 'error'))
      .finally(() => setLoading(false))
  }, [])

  const sections = useMemo(() => template?.schema_json?.sections ?? [], [template])

  const setSections = (next: Section[]) => {
    setTemplate(prev => prev ? { ...prev, schema_json: { sections: next } } : prev)
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
      const res = await api.patch('/api/templates/me/draft', {
        name: template.name,
        schema_json: template.schema_json,
      })
      setTemplate(res.data.template)
      toast('Template draft saved', 'success')
    } catch (err: any) {
      toast(err?.response?.data?.error || 'Could not save draft', 'error')
    } finally {
      setSaving(false)
    }
  }

  const publish = async () => {
    setPublishing(true)
    try {
      const res = await api.post('/api/templates/me/publish')
      setTemplate(res.data.template)
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
      const res = await api.post(`/api/templates/me/activate/${versionId}`)
      setTemplate(prev => prev ? { ...prev, active_version_id: res.data.active_version.id } : prev)
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
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-white font-semibold text-lg">Template Builder</h1>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={saveDraft} loading={saving}>
                  <Save size={13} /> Save Draft
                </Button>
                <Button size="sm" onClick={publish} loading={publishing}>
                  <Upload size={13} /> Publish Version
                </Button>
              </div>
            </div>
            <Input
              label="Template name"
              value={template?.name ?? ''}
              onChange={e => setTemplate(prev => prev ? { ...prev, name: e.target.value } : prev)}
            />
          </Card>

          <Card variant="elevated" className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-medium">Sections</h2>
              <Button size="sm" variant="secondary" onClick={addSection}>
                <Plus size={13} /> Add Section
              </Button>
            </div>
            {sections.map((s, i) => (
              <div key={s.id} className="grid grid-cols-12 gap-2 items-center bg-white/4 border border-white/10 rounded-xl p-3">
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

          <Card variant="elevated" className="p-5">
            <h2 className="text-white font-medium mb-3">Version History</h2>
            <div className="space-y-2">
              {versions.map(v => (
                <div key={v.id} className="flex items-center justify-between bg-white/4 border border-white/10 rounded-xl px-3 py-2">
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
        </div>
      </main>
    </div>
  )
}
