'use client'

import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { createWorkflow } from '@/app/actions/workflows'

type StepDraft = {
  id: string
  stepType: string
  actionType: string
  config: string
}

const triggerOptions = [
  { value: 'MEMBER_CREATED', label: 'Nuevo socio registrado' },
  { value: 'INVOICE_OVERDUE', label: 'Factura vencida' },
  { value: 'PAYMENT_RECEIVED', label: 'Pago recibido' },
  { value: 'SCHEDULED_CRON', label: 'Programado (cron)' },
]

const actionOptions = [
  { value: 'NOTIFY_WHATSAPP', label: 'Enviar WhatsApp' },
  { value: 'SEND_EMAIL', label: 'Enviar email' },
  { value: 'CREATE_INVOICE', label: 'Crear factura' },
  { value: 'TAG_MEMBER', label: 'Etiquetar socio' },
]

export function WorkflowBuilderForm() {
  const [steps, setSteps] = useState<StepDraft[]>([
    { id: crypto.randomUUID(), stepType: 'ACTION', actionType: 'NOTIFY_WHATSAPP', config: '' },
  ])

  const [triggerType, setTriggerType] = useState('MEMBER_CREATED')
  const [triggerConfig, setTriggerConfig] = useState('')

  const stepsPayload = useMemo(
    () =>
      JSON.stringify(
        steps.map((step, index) => ({
          position: index + 1,
          stepType: step.stepType,
          actionType: step.actionType,
          config: step.config.trim() ? { value: step.config.trim() } : null,
        })),
      ),
    [steps],
  )

  const triggerPayload = useMemo(
    () => JSON.stringify(triggerConfig.trim() ? { value: triggerConfig.trim() } : {}),
    [triggerConfig],
  )

  async function action(formData: FormData) {
    const name = String(formData.get('name') || '')
    const description = String(formData.get('description') || '')
    const triggerTypeValue = String(formData.get('triggerType') || 'MEMBER_CREATED')
    const isActive = String(formData.get('isActive') || '') === 'on'

    const rawSteps = String(formData.get('stepsPayload') || '[]')
    const rawTriggerConfig = String(formData.get('triggerPayload') || '{}')

    const parsedSteps = JSON.parse(rawSteps) as Array<{
      position: number
      stepType: string
      actionType: string
      config?: Record<string, string> | null
    }>
    const parsedTriggerConfig = JSON.parse(rawTriggerConfig) as Record<string, string>

    await createWorkflow({
      name,
      description,
      triggerType: triggerTypeValue,
      triggerConfig: Object.keys(parsedTriggerConfig).length ? parsedTriggerConfig : null,
      isActive,
      steps: parsedSteps,
    })

    setSteps([{ id: crypto.randomUUID(), stepType: 'ACTION', actionType: 'NOTIFY_WHATSAPP', config: '' }])
    setTriggerType('MEMBER_CREATED')
    setTriggerConfig('')
  }

  function addStep() {
    setSteps((current) => [
      ...current,
      { id: crypto.randomUUID(), stepType: 'ACTION', actionType: 'SEND_EMAIL', config: '' },
    ])
  }

  function removeStep(id: string) {
    setSteps((current) => (current.length > 1 ? current.filter((step) => step.id !== id) : current))
  }

  function updateStep(id: string, patch: Partial<StepDraft>) {
    setSteps((current) => current.map((step) => (step.id === id ? { ...step, ...patch } : step)))
  }

  return (
    <form action={action} className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Nuevo workflow</h2>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="isActive" defaultChecked />
          Activo
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input
          name="name"
          required
          placeholder="Nombre del workflow"
          className="border rounded-lg px-3 py-2 text-slate-900"
        />
        <select
          name="triggerType"
          value={triggerType}
          onChange={(event) => setTriggerType(event.target.value)}
          className="border rounded-lg px-3 py-2 text-slate-900 bg-white"
        >
          {triggerOptions.map((option) => (
            <option key={option.value} value={option.value}>
              Trigger: {option.label}
            </option>
          ))}
        </select>
      </div>

      <input
        name="description"
        placeholder="Descripción (opcional)"
        className="border rounded-lg px-3 py-2 text-slate-900 w-full"
      />

      <input
        value={triggerConfig}
        onChange={(event) => setTriggerConfig(event.target.value)}
        placeholder="Config trigger (ej: 0 9 * * 1 para cron semanal)"
        className="border rounded-lg px-3 py-2 text-slate-900 w-full"
      />

      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-medium text-slate-700">Flujo de pasos (estilo n8n)</p>
          <button
            type="button"
            onClick={addStep}
            className="inline-flex items-center gap-2 text-sm bg-slate-900 text-white px-3 py-1.5 rounded-lg"
          >
            <Plus size={16} />
            Añadir paso
          </button>
        </div>

        <div className="space-y-3">
          {steps.map((step, index) => (
            <div key={step.id} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center bg-white rounded-lg p-3 border">
              <p className="text-sm font-semibold text-slate-500">Paso {index + 1}</p>
              <select
                value={step.stepType}
                onChange={(event) => updateStep(step.id, { stepType: event.target.value })}
                className="border rounded-lg px-3 py-2 text-slate-900 bg-white"
              >
                <option value="ACTION">Acción</option>
                <option value="CONDITION">Condición</option>
                <option value="DELAY">Espera</option>
              </select>
              <select
                value={step.actionType}
                onChange={(event) => updateStep(step.id, { actionType: event.target.value })}
                className="border rounded-lg px-3 py-2 text-slate-900 bg-white"
              >
                {actionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <input
                  value={step.config}
                  onChange={(event) => updateStep(step.id, { config: event.target.value })}
                  placeholder="Config"
                  className="border rounded-lg px-3 py-2 text-slate-900 w-full"
                />
                <button
                  type="button"
                  onClick={() => removeStep(step.id)}
                  className="text-rose-600 hover:text-rose-700 p-2"
                  aria-label="Eliminar paso"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <input type="hidden" name="stepsPayload" value={stepsPayload} readOnly />
      <input type="hidden" name="triggerPayload" value={triggerPayload} readOnly />

      <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium">
        Guardar workflow
      </button>
    </form>
  )
}
