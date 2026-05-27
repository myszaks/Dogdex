'use client'
import { useState, useEffect, useCallback } from 'react'
import FormBuilder from './FormBuilder'
import TemplateFieldConfigurator from './TemplateFieldConfigurator'
import { getEventType } from '@/lib/eventTypes'
import type { FormField } from '@/types'

interface TemplateMeta {
  id: string
  name: string
  event_type_id: string | null
  fields: FormField[]
}

interface Props {
  eventTypeId: string | null
  selectedTemplateId: string | null
  initialConfiguredFields?: FormField[]
  onSelect: (templateId: string | null, fields: FormField[]) => void
}

type ModalMode = 'create' | 'edit'

export default function FormTemplatePicker({ eventTypeId, selectedTemplateId, initialConfiguredFields, onSelect }: Props) {
  const [templates, setTemplates] = useState<TemplateMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState<ModalMode>('create')
  const [editingId, setEditingId] = useState<string | null>(null)

  const [modalName, setModalName] = useState('')
  const [modalFields, setModalFields] = useState<FormField[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [configuredFields, setConfiguredFields] = useState<FormField[]>(initialConfiguredFields ?? [])

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/form-templates')
      const data = await res.json()
      setTemplates(Array.isArray(data) ? data : [])
    } catch {
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTemplates() }, [fetchTemplates])

  function openCreateModal() {
    setModalMode('create')
    setEditingId(null)
    if (eventTypeId) {
      const et = getEventType(eventTypeId)
      setModalFields(et?.defaultFields.length
        ? et.defaultFields.map(f => ({ ...f, id: `${f.id}_${Date.now()}` }))
        : [])
    } else {
      setModalFields([])
    }
    setModalName('')
    setSaveError(null)
    setShowModal(true)
  }

  function openEditModal(t: TemplateMeta, e: React.MouseEvent) {
    e.stopPropagation()
    setModalMode('edit')
    setEditingId(t.id)
    setModalName(t.name)
    setModalFields(t.fields.map(f => ({ ...f })))
    setSaveError(null)
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setModalName('')
    setModalFields([])
    setSaveError(null)
    setEditingId(null)
  }

  async function saveTemplate() {
    if (!modalName.trim()) return
    setSaving(true)
    setSaveError(null)
    try {
      if (modalMode === 'edit' && editingId) {
        const delRes = await fetch(`/api/form-templates/${editingId}`, { method: 'DELETE' })
        if (!delRes.ok) throw new Error('Błąd usuwania starego szablonu')
        const res = await fetch('/api/form-templates', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: modalName.trim(), event_type_id: eventTypeId, fields: modalFields }),
        })
        if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? 'Błąd serwera') }
        const updated: TemplateMeta = await res.json()
        setTemplates(prev => prev.filter(t => t.id !== editingId).concat(updated))
        if (selectedTemplateId === editingId) {
          const fresh = updated.fields.map(f => ({ ...f }))
          setConfiguredFields(fresh)
          onSelect(updated.id, fresh)
        }
      } else {
        const res = await fetch('/api/form-templates', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: modalName.trim(), event_type_id: eventTypeId, fields: modalFields }),
        })
        if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? 'Błąd serwera') }
        const newTemplate: TemplateMeta = await res.json()
        setTemplates(prev => [newTemplate, ...prev])
        onSelect(newTemplate.id, newTemplate.fields)
      }
      closeModal()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Błąd')
    } finally {
      setSaving(false)
    }
  }

  async function deleteTemplate(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (deletingId === id) {
      try {
        const res = await fetch(`/api/form-templates/${id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error()
        setTemplates(prev => prev.filter(t => t.id !== id))
        if (selectedTemplateId === id) {
          setConfiguredFields([])
          onSelect(null, [])
        }
      } catch {
        // ignore
      } finally {
        setDeletingId(null)
      }
    } else {
      setDeletingId(id)
      setTimeout(() => setDeletingId(d => d === id ? null : d), 3000)
    }
  }

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId)
  const matching = eventTypeId ? templates.filter(t => t.event_type_id === eventTypeId) : templates
  const other = eventTypeId ? templates.filter(t => t.event_type_id !== eventTypeId) : []

  return (
    <>
      <div className="space-y-2">
        {loading && <p className="text-sm text-slate-400">Ładowanie szablonów...</p>}

        {!loading && templates.length === 0 && (
          <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl">
            <p className="text-2xl mb-2">📋</p>
            <p className="text-slate-500 text-sm mb-4">Nie masz jeszcze żadnych szablonów.</p>
            <button type="button" onClick={openCreateModal} className="btn btn-primary">
              + Stwórz pierwszy szablon
            </button>
          </div>
        )}

        {!loading && templates.length > 0 && (
          <>
            {selectedTemplateId && (
              <button
                type="button"
                onClick={() => { setConfiguredFields([]); onSelect(null, []) }}
                className="text-xs text-slate-400 hover:text-slate-600 underline"
              >
                Usuń wybór (brak dodatkowych pól)
              </button>
            )}

            {matching.map(t => (
              <TemplateCard
                key={t.id}
                template={t}
                selected={selectedTemplateId === t.id}
                deletingConfirm={deletingId === t.id}
                onSelect={() => {
                  const fresh = t.fields.map(f => ({ ...f }))
                  setConfiguredFields(fresh)
                  onSelect(t.id, fresh)
                }}
                onEdit={e => openEditModal(t, e)}
                onDelete={e => deleteTemplate(t.id, e)}
              />
            ))}

            {other.length > 0 && (
              <>
                {matching.length > 0 && <p className="text-xs text-slate-400 pt-1">Inne szablony:</p>}
                {other.map(t => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    selected={selectedTemplateId === t.id}
                    deletingConfirm={deletingId === t.id}
                    onSelect={() => {
                      const fresh = t.fields.map(f => ({ ...f }))
                      setConfiguredFields(fresh)
                      onSelect(t.id, fresh)
                    }}
                    onEdit={e => openEditModal(t, e)}
                    onDelete={e => deleteTemplate(t.id, e)}
                    dimmed
                  />
                ))}
              </>
            )}

            <button type="button" onClick={openCreateModal} className="btn btn-secondary w-full text-sm mt-1">
              + Stwórz nowy szablon
            </button>
          </>
        )}

        {selectedTemplate && (
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Uzupełnij pola — {selectedTemplate.name}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Pola stałe (imię właściciela, e-mail, imię psa, rasa) są zawsze dostępne.
              </p>
            </div>
            {configuredFields.length > 0 ? (
              <TemplateFieldConfigurator
                fields={configuredFields}
                onChange={updated => {
                  setConfiguredFields(updated)
                  onSelect(selectedTemplate.id, updated)
                }}
              />
            ) : (
              <p className="text-xs text-slate-400 italic">Brak pól dodatkowych w tym szablonie.</p>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50"
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-xl max-h-[92dvh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
              <h2 className="font-semibold text-slate-800">
                {modalMode === 'edit' ? 'Edytuj szablon' : 'Nowy szablon formularza'}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-700 text-xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="form-label">Nazwa szablonu *</label>
                <input
                  className="form-input"
                  value={modalName}
                  onChange={e => setModalName(e.target.value)}
                  placeholder="np. Agility A1–A3, Rejestracja standardowa..."
                  autoFocus
                />
              </div>
              <FormBuilder
                value={modalFields}
                onChange={setModalFields}
                eventTypeId={eventTypeId}
                hideTemplateActions
                templateMode
              />
            </div>
            <div className="px-5 py-4 border-t border-slate-200 space-y-2 shrink-0">
              {saveError && <p className="text-sm text-red-600">⚠ {saveError}</p>}
              <div className="flex gap-3">
                <button type="button" onClick={closeModal} className="btn btn-secondary flex-1">Anuluj</button>
                <button
                  type="button"
                  onClick={saveTemplate}
                  disabled={saving || !modalName.trim()}
                  className="btn btn-primary flex-1"
                >
                  {saving ? 'Zapisywanie...' : modalMode === 'edit' ? 'Zapisz zmiany' : 'Zapisz i użyj'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function fieldTypeLabel(type: FormField['type']): string {
  const map: Record<FormField['type'], string> = {
    text: 'tekst',
    number: 'liczba',
    email: 'e-mail',
    select: 'lista',
    multiselect: 'wielokrotny wybór',
    multidate: 'daty (wielokrotny wybór)',
    textarea: 'długi tekst',
    checkbox: 'checkbox',
  }
  return map[type] ?? type
}

function TemplateCard({
  template,
  selected,
  deletingConfirm,
  onSelect,
  onEdit,
  onDelete,
  dimmed,
}: {
  template: TemplateMeta
  selected: boolean
  deletingConfirm: boolean
  onSelect: () => void
  onEdit: (e: React.MouseEvent) => void
  onDelete: (e: React.MouseEvent) => void
  dimmed?: boolean
}) {
  const eventType = getEventType(template.event_type_id)

  return (
    <div
      className={`rounded-xl border-2 transition-colors ${
        selected
          ? 'border-sky-500 bg-sky-50'
          : dimmed
          ? 'border-slate-100 bg-white opacity-60 hover:opacity-100 hover:border-slate-200'
          : 'border-slate-200 bg-white hover:border-sky-300 hover:bg-sky-50/40'
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <p className="font-medium text-slate-800 truncate">{template.name}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {template.fields.length > 0
              ? `${template.fields.length} pól dodatkowych`
              : 'Tylko pola podstawowe'}
            {eventType && (
              <span className="ml-2 text-slate-300">· {eventType.icon} {eventType.name}</span>
            )}
          </p>
        </div>
        {selected ? (
          <span className="text-sky-500 text-xl ml-3 shrink-0">✓</span>
        ) : (
          <span className="text-slate-300 text-sm ml-3 shrink-0">Wybierz</span>
        )}
      </button>
      <div className="flex gap-1 px-3 pb-2">
        <button
          type="button"
          onClick={onEdit}
          className="text-xs text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded px-2 py-1 transition-colors"
        >
          Edytuj
        </button>
        <button
          type="button"
          onClick={onDelete}
          className={`text-xs rounded px-2 py-1 transition-colors ${
            deletingConfirm
              ? 'text-white bg-red-500 hover:bg-red-600'
              : 'text-slate-400 hover:text-red-500 hover:bg-red-50'
          }`}
        >
          {deletingConfirm ? 'Kliknij ponownie, aby usunąć' : 'Usuń'}
        </button>
      </div>
    </div>
  )
}