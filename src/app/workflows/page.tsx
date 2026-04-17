import { prisma } from '@/lib/prisma'
import { deleteWorkflow, setWorkflowActive } from '@/app/actions/workflows'
import { WorkflowBuilderForm } from './WorkflowBuilderForm'

export const dynamic = 'force-dynamic'

function formatJsonConfig(value: unknown) {
  if (!value || typeof value !== 'object') return '-'
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => typeof item === 'string' && item.trim() !== '')
    .map(([key, item]) => `${key}: ${String(item)}`)

  return entries.length ? entries.join(' | ') : '-'
}

export default async function WorkflowsPage() {
  const [workflows, teams] = await Promise.all([
    prisma.workflow.findMany({
      include: {
        steps: {
          orderBy: { position: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.team.findMany({
      select: {
        id: true,
        name: true,
        category: true,
      },
      orderBy: { name: 'asc' },
    }),
  ])

  const activeCount = workflows.filter((workflow) => workflow.isActive).length

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Workflows</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <p className="text-sm text-slate-500">Total workflows</p>
          <p className="text-2xl font-bold">{workflows.length}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-sm text-slate-500">Activos</p>
          <p className="text-2xl font-bold text-emerald-600">{activeCount}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-sm text-slate-500">Inactivos</p>
          <p className="text-2xl font-bold text-rose-600">{workflows.length - activeCount}</p>
        </div>
      </div>

      <WorkflowBuilderForm teams={teams} />

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b bg-slate-50 font-semibold">Flujos configurados</div>
        <div className="divide-y">
          {workflows.map((workflow) => (
            <div key={workflow.id} className="p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold">{workflow.name}</p>
                  <p className="text-sm text-slate-500">{workflow.description || 'Sin descripción'}</p>
                </div>
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                    workflow.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {workflow.isActive ? 'Activo' : 'Inactivo'}
                </span>
              </div>

              <div className="text-sm text-slate-600">
                Trigger: <span className="font-medium">{workflow.triggerType}</span> | Config:{' '}
                <span className="font-medium">{formatJsonConfig(workflow.triggerConfig)}</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {workflow.steps.map((step) => (
                  <span
                    key={step.id}
                    className="inline-flex items-center gap-2 px-2 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium"
                  >
                    {step.position}. {step.stepType} - {step.actionType} ({formatJsonConfig(step.config)})
                  </span>
                ))}
                {workflow.steps.length === 0 && <span className="text-sm text-slate-400">Sin pasos</span>}
              </div>

              <div className="flex gap-2">
                <form action={setWorkflowActive.bind(null, workflow.id, !workflow.isActive)}>
                  <button
                    className={`px-3 py-2 rounded-lg text-white text-sm ${
                      workflow.isActive ? 'bg-slate-700 hover:bg-slate-800' : 'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                  >
                    {workflow.isActive ? 'Desactivar' : 'Activar'}
                  </button>
                </form>
                <form action={deleteWorkflow.bind(null, workflow.id)}>
                  <button className="px-3 py-2 rounded-lg text-white text-sm bg-rose-600 hover:bg-rose-700">
                    Eliminar
                  </button>
                </form>
              </div>
            </div>
          ))}

          {workflows.length === 0 && (
            <p className="p-6 text-sm text-slate-500">Aún no hay workflows configurados.</p>
          )}
        </div>
      </div>
    </div>
  )
}
