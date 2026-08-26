/**
 * Estados de una cuota asignada a un socio (`Subscription.status`).
 *
 * `PENDING_PAYMENT` es el estado de una cuota recién asignada que exige pago: la
 * cuota existe y su primera factura está emitida, pero **no cuenta como activa**
 * hasta que el pago se confirma (o hasta que un admin la marca activa a mano).
 *
 * El vocabulario vive aquí y no repetido por el código: los sitios que preguntan
 * "¿este socio ya tiene cuota?" deben incluir las pendientes, o se le asignaría
 * una segunda y se le cobraría dos veces.
 */

export const SUBSCRIPTION_STATUSES = ['ACTIVE', 'PENDING_PAYMENT', 'PAUSED', 'CANCELED'] as const

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

/**
 * Estados que "ocupan" al socio: tiene cuota, aunque aún no esté cobrada. Se usa
 * para no duplicar cuotas y para decidir quién aparece como "sin cuota".
 */
export const SUBSCRIPTION_ACTIVE_LIKE: SubscriptionStatus[] = ['ACTIVE', 'PENDING_PAYMENT']

/** Estados que se muestran en la gestión de cuotas del CRM. */
export const SUBSCRIPTION_VISIBLE: SubscriptionStatus[] = ['ACTIVE', 'PENDING_PAYMENT', 'PAUSED']

export function subscriptionStatusLabel(status: string): string {
  switch (status) {
    case 'ACTIVE':
      return 'Activa'
    case 'PENDING_PAYMENT':
      return 'Pendiente de pago'
    case 'PAUSED':
      return 'Pausada'
    case 'CANCELED':
      return 'Cancelada'
    default:
      return status
  }
}
