import type { ProclubWorkflowStep } from './types'

export function wa(msg: string, label: string): ProclubWorkflowStep {
  return {
    position: 0,
    stepType: 'ACTION',
    actionType: 'SEND_WHATSAPP',
    config: { waPhone: '{memberPhone}', waMessage: msg, label, stepKey: label },
  }
}

/** WhatsApp al tutor; si no hay guardianPhone, el motor usa teléfono del socio. */
export function waGuardian(msg: string, label: string): ProclubWorkflowStep {
  return {
    position: 0,
    stepType: 'ACTION',
    actionType: 'SEND_WHATSAPP',
    config: { waPhone: '{guardianPhone}', waMessage: msg, label, stepKey: label },
  }
}

export function action(
  actionType: string,
  config: Record<string, unknown>,
  label: string,
): ProclubWorkflowStep {
  return {
    position: 0,
    stepType: 'ACTION',
    actionType,
    config: { ...config, label, stepKey: label },
  }
}

export function withPositions(steps: ProclubWorkflowStep[]): ProclubWorkflowStep[] {
  return steps.map((s, i) => ({ ...s, position: i }))
}
