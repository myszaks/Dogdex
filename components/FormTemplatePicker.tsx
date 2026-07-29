'use client'
import { useState, useEffect, useCallback } from 'react'
import FormBuilder from './FormBuilder'
import TemplateFieldConfigurator from './TemplateFieldConfigurator'
import { getEventType } from '@/lib/eventTypes'
import { validateFormFieldDefinitions } from '@/lib/registrationFormValidation'
import { Check, FilePlus2, Pencil, Trash2, X } from 'lucide-react'
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
  useEffect(() => {
    if (!showModal) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [showModal])

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
    const fieldIssues = validateFormFieldDefinitions(modalFields, { allowEmptyOptions: true })
    if (fieldIssues.length > 0) {
      setSaveError(fieldIssues[0].message)
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      if (modalMode === 'edit' && editingId) {
        const res = await fetch(`/api/form-templates/${editingId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: modalName.trim(), event_type_id: eventTypeId, fields: modalFields }),
        })
        if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? 'Błąd serwera') }
        const updated: TemplateMeta = await res.json()
        setTemplates(prev => prev.map(t => t.id === editingId ? updated : t))
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
      <div className="space-y-3">
        {loading && <p className="text-sm text-slate-400">Ładowanie szablonów...</p>}

        {!loading && templates.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-[#d6e2d0] bg-[#fafcf8] px-5 py-8 text-center">
            <FilePlus2 className="mx-auto mb-3 h-7 w-7 text-[#7b8b73]" />
            <p className="font-semibold text-[#43513d]">Zacznij od własnego formularza</p>
            <p className="mx-auto mb-4 mt-1 max-w-md text-sm leading-relaxed text-[#71806a]">
              Pola z danymi właściciela i psa są już gotowe. Dodaj tylko pytania potrzebne przy tym rodzaju wydarzenia.
            </p>
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
                className="min-h-10 rounded-xl px-3 text-sm font-medium text-[#66735f] hover:bg-[#f4f7f1]"
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

            <button type="button" onClick={openCreateModal} className="btn btn-secondary min-h-11 w-full text-sm mt-1">
              + Stwórz nowy szablon
            </button>
          </>
        )}

        {selectedTemplate && (
          <div className="rounded-2xl border border-[#d6e2d0] bg-[#f8faf6] p-4 space-y-3">
            <div>
              <p className="font-semibold text-[#43513d]">
                Opcje dla tego wydarzenia
              </p>
              <p className="mt-1 text-sm leading-relaxed text-[#71806a]">
                Wybrano „{selectedTemplate.name}”. Sprawdź daty i opcje odpowiedzi — możesz je zmienić bez modyfikowania szablonu.
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
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="form-template-modal-title"
        >
          <div className="flex max-h-[94dvh] w-full flex-col rounded-t-3xl bg-white shadow-xl sm:max-w-3xl sm:rounded-3xl">
            <div className="flex shrink-0 items-center justify-between border-b border-[#e4ebe0] px-5 py-4">
              <div>
              <h2 id="form-template-modal-title" className="font-semibold text-[#34402f]">
                {modalMode === 'edit' ? 'Edytuj szablon' : 'Nowy szablon formularza'}
              </h2>
              <p className="mt-0.5 text-xs text-[#71806a]">Ten szablon będzie widoczny tylko na Twoim koncie organizatora.</p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="flex h-11 w-11 items-center justify-center rounded-xl text-[#71806a] hover:bg-[#f4f7f1]"
                aria-label="Zamknij"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <div>
                <label className="form-label">Nazwa szablonu *</label>
                <input
                  className="form-input min-h-11"
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
            <div className="shrink-0 space-y-2 border-t border-[#e4ebe0] bg-white px-5 py-4">
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
          ? 'border-[#ef7a42] bg-[#fff7f2]'
          : dimmed
          ? 'border-[#e9eee6] bg-white opacity-60 hover:opacity-100 hover:border-[#d6e2d0]'
          : 'border-[#dfe8d8] bg-white hover:border-[#aebda7] hover:bg-[#fafcf8]'
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-h-16 w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <p className="truncate font-semibold text-[#43513d]">{template.name}</p>
          <p className="mt-0.5 text-xs text-[#71806a]">
            {template.fields.length > 0
              ? `${template.fields.length} pól dodatkowych`
              : 'Tylko pola podstawowe'}
            {eventType && (
              <span className="ml-2 text-slate-300">· {eventType.icon} {eventType.name}</span>
            )}
          </p>
        </div>
        {selected ? (
          <span className="ml-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#ef7a42] text-white">
            <Check className="h-4 w-4" />
          </span>
        ) : (
          <span className="text-sm ml-3 shrink-0 text-[#83907d]">Wybierz</span>
        )}
      </button>
      <div className="flex flex-wrap gap-2 px-3 pb-3">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-[#66735f] transition-colors hover:bg-[#f4f7f1]"
        >
          <Pencil className="h-3.5 w-3.5" /> Edytuj
        </button>
        <button
          type="button"
          onClick={onDelete}
          className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
            deletingConfirm
              ? 'text-white bg-red-500 hover:bg-red-600'
              : 'text-[#8a6b60] hover:text-red-600 hover:bg-red-50'
          }`}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {deletingConfirm ? 'Kliknij ponownie, aby usunąć' : 'Usuń'}
        </button>
      </div>
    </div>
  )
}
