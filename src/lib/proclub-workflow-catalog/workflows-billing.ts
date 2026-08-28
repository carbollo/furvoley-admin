import { defineProclubWorkflow, type ProclubCatalogEntry } from '@/lib/proclub-workflow-catalog/types'

export const BILLING_PROCLUB_WORKFLOWS: ProclubCatalogEntry[] = [
  defineProclubWorkflow('WC-1', {
    area: 'billing',
    automation: 'manual',
    phase: 1,
    name: 'WC-1 · Catálogo de cuotas del club',
    description: 'Configuración manual en CRM (planes de membresía). No es un flujo automático.',
    triggerType: 'MEMBER_CREATED',
    isActive: false,
    steps: [],
  }),
  defineProclubWorkflow('WC-2', {
    area: 'billing',
    automation: 'auto',
    phase: 1,
    name: 'WC-2 · Asignación automática de cuotas al cerrar inscripción',
    description: 'Tras alta en plantilla: crear suscripción según plan del grupo.',
    triggerType: 'TEAM_ROSTER_CONFIRMED',
    triggerConfig: { eventKinds: ['TEAM_ROSTER_CONFIRMED', 'MEMBER_CREATED'] },
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'CREATE_SUBSCRIPTION',
        config: {
          stepKey: 'wc2_sub',
          label: 'Suscripción del grupo',
          planId: '',
          autoPay: 'false',
        },
      },
    ],
  }),
  defineProclubWorkflow('WC-3', {
    area: 'billing',
    automation: 'auto',
    phase: 1,
    name: 'WC-3 · Primer cobro al cerrar la inscripción',
    description: 'Factura inicial + enlace de pago WhatsApp; socio pendiente de pago.',
    triggerType: 'TEAM_ROSTER_CONFIRMED',
    triggerConfig: { eventKinds: ['TEAM_ROSTER_CONFIRMED'] },
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'CREATE_INVOICE_FROM_PLAN',
        config: { stepKey: 'wc3_inv', label: 'Primera factura' },
      },
      {
        position: 1,
        stepType: 'ACTION',
        actionType: 'SEND_PAYMENT_LINK',
        config: { stepKey: 'wc3_pay', label: 'Enlace de pago' },
      },
      {
        position: 2,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP',
        config: {
          stepKey: 'wc3_wa',
          label: 'Aviso pago tutor',
          waPhone: '{guardianPhone}',
          waMessage:
            'Hola, para completar la inscripción de {memberName} realiza el pago: {paymentUrl}',
        },
      },
      {
        position: 3,
        stepType: 'ACTION',
        actionType: 'SET_MEMBER_STATUS',
        config: { stepKey: 'wc3_status', label: 'Pendiente pago', targetStatus: 'PENDING_PAYMENT' },
      },
    ],
  }),
  defineProclubWorkflow('WC-4', {
    area: 'billing',
    automation: 'auto',
    phase: 1,
    name: 'WC-4 · Emisión de cuotas periódicas',
    description: 'Ciclo mensual: facturas para socios activos con suscripción.',
    triggerType: 'BILLING_CYCLE_DUE',
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'CREATE_INVOICE_FROM_PLAN',
        config: { stepKey: 'wc4_inv', label: 'Cuota del periodo' },
      },
      {
        position: 1,
        stepType: 'ACTION',
        actionType: 'SEND_PAYMENT_LINK',
        config: { stepKey: 'wc4_pay', label: 'Enlace pago' },
      },
      {
        position: 2,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP',
        config: {
          stepKey: 'wc4_wa',
          label: 'Aviso cuota',
          waPhone: '{guardianPhone}',
          waMessage: 'Cuota {invoiceNumber} ({pendingAmount} {invoiceCurrency}). Paga aquí: {paymentUrl}',
        },
      },
    ],
  }),
  defineProclubWorkflow('WC-5', {
    area: 'billing',
    automation: 'mixed',
    phase: 4,
    name: 'WC-5 · Cobro de concepto extra puntual',
    description: 'Cobro extra creado: enlace de pago al socio.',
    triggerType: 'EXTRA_CHARGE_CREATED',
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'SEND_PAYMENT_LINK',
        config: { stepKey: 'wc5_pay', label: 'Enlace cobro extra' },
      },
      {
        position: 1,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP',
        config: {
          stepKey: 'wc5_wa',
          label: 'Aviso cobro extra',
          waPhone: '{guardianPhone}',
          waMessage: 'Cobro adicional del club: {pendingAmount} €. Paga aquí: {paymentUrl}',
        },
      },
    ],
  }),
  defineProclubWorkflow('WC-6', {
    area: 'billing',
    automation: 'auto',
    phase: 4,
    name: 'WC-6 · Aplicación de descuentos y becas',
    description: 'Al crear factura: aplicar reglas de descuento (hermano, beca).',
    triggerType: 'INVOICE_CREATED',
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'APPLY_DISCOUNT_RULES',
        config: { stepKey: 'wc6_disc', label: 'Aplicar descuentos' },
      },
    ],
  }),
  defineProclubWorkflow('WC-7', {
    area: 'billing',
    automation: 'auto',
    phase: 1,
    name: 'WC-7 · Confirmación de pago y emisión del recibo',
    description: 'Factura pagada: PDF por WhatsApp al tutor.',
    triggerType: 'INVOICE_PAID',
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'SEND_INVOICE_PDF_WHATSAPP',
        config: {
          stepKey: 'wc7_pdf',
          label: 'Recibo WhatsApp',
          waPhone: '{guardianPhone}',
          waMessage: 'Pago recibido. Factura {invoiceNumber}. PDF: {invoicePdfUrl}',
        },
      },
      {
        position: 1,
        stepType: 'ACTION',
        actionType: 'SET_MEMBER_STATUS',
        config: { stepKey: 'wc7_active', label: 'Activar socio', targetStatus: 'ACTIVE' },
      },
    ],
  }),
  defineProclubWorkflow('WC-8', {
    area: 'billing',
    automation: 'auto',
    phase: 1,
    name: 'WC-8 · Detección de impago y primer aviso',
    description: 'Factura vencida: primer recordatorio WhatsApp.',
    triggerType: 'INVOICE_OVERDUE',
    steps: [
      // El enlace hay que generarlo ANTES de nombrarlo. Sin este paso,
      // {paymentUrl} se sustituye por nada y al socio le llega «Paga aquí:»
      // seguido de vacío — que es peor que no mandarle nada.
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'SEND_PAYMENT_LINK',
        config: { stepKey: 'wc8_pay', label: 'Enlace de pago' },
      },
      {
        position: 1,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP',
        config: {
          stepKey: 'wc8_wa',
          label: 'Primer aviso impago',
          waPhone: '{guardianPhone}',
          waMessage:
            'Recordatorio: factura {invoiceNumber} pendiente ({pendingAmount} €). Paga aquí: {paymentUrl}',
        },
      },
    ],
  }),
  defineProclubWorkflow('WC-9', {
    area: 'billing',
    automation: 'auto',
    phase: 4,
    name: 'WC-9 · Reintento automático del cobro',
    description: 'Pago fallido: reintento programado.',
    triggerType: 'PAYMENT_FAILED',
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'RETRY_PAYMENT',
        config: { stepKey: 'wc9_retry', label: 'Reintentar cobro', delayDays: '3' },
      },
    ],
  }),
  defineProclubWorkflow('WC-10', {
    area: 'billing',
    automation: 'auto',
    phase: 4,
    name: 'WC-10 · Escalado de impago al admin',
    description: 'Impago prolongado: aviso al administrador del club.',
    triggerType: 'INVOICE_OVERDUE_ESCALATED',
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP',
        config: {
          stepKey: 'wc10_admin',
          label: 'Aviso admin',
          waPhone: '{clubAdminPhone}',
          waMessage:
            'Impago escalado: {memberName} · {invoiceNumber} · {pendingAmount} € · vence {invoiceDueDate}',
        },
      },
    ],
  }),
  defineProclubWorkflow('WC-11', {
    area: 'billing',
    automation: 'auto',
    phase: 4,
    name: 'WC-11 · Listado periódico de impagos',
    description: 'Resumen semanal de impagos al admin.',
    triggerType: 'OVERDUE_REPORT_DUE',
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'SEND_OVERDUE_REPORT',
        config: { stepKey: 'wc11_report', label: 'Informe impagos' },
      },
    ],
  }),
  defineProclubWorkflow('WC-12', {
    area: 'billing',
    automation: 'mixed',
    phase: 4,
    name: 'WC-12 · Bloqueo del jugador por impago grave',
    description: 'Umbral de impago: proponer suspensión del socio.',
    triggerType: 'INVOICE_OVERDUE_ESCALATED',
    triggerConfig: { threshold: 'severe' },
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'SET_MEMBER_STATUS',
        config: { stepKey: 'wc12_pause', label: 'Suspender socio', targetStatus: 'PAUSED' },
      },
      {
        position: 1,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP',
        config: {
          stepKey: 'wc12_wa',
          label: 'Aviso suspensión',
          waPhone: '{guardianPhone}',
          waMessage:
            'La inscripción de {memberName} queda en pausa por impago. Contacta con el club para regularizar.',
        },
      },
    ],
  }),
  defineProclubWorkflow('WC-13', {
    area: 'billing',
    automation: 'auto',
    phase: 4,
    name: 'WC-13 · Tarjeta o método de pago caducado',
    description: 'Método de pago caducado: aviso al tutor.',
    triggerType: 'PAYMENT_METHOD_EXPIRING',
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP',
        config: {
          stepKey: 'wc13_wa',
          label: 'Actualizar método pago',
          waPhone: '{guardianPhone}',
          waMessage: 'Actualiza el método de pago del club para evitar interrupciones: {paymentUrl}',
        },
      },
    ],
  }),
  defineProclubWorkflow('WC-14', {
    area: 'billing',
    automation: 'mixed',
    phase: 4,
    name: 'WC-14 · Pausa de cobros por lesión / suspensión temporal',
    description: 'Suscripción pausada hasta fecha de reactivación.',
    triggerType: 'SUBSCRIPTION_PAUSED',
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP',
        config: {
          stepKey: 'wc14_wa',
          label: 'Confirmación pausa',
          waPhone: '{guardianPhone}',
          waMessage: 'Los cobros de {memberName} quedan en pausa hasta nueva comunicación del club.',
        },
      },
    ],
  }),
  defineProclubWorkflow('WC-15', {
    area: 'billing',
    automation: 'mixed',
    phase: 4,
    name: 'WC-15 · Devolución prorrateada por baja a mitad de mes',
    description: 'Baja efectiva: calcular y notificar devolución.',
    triggerType: 'MEMBER_STATUS_CHANGED',
    triggerConfig: { onlyWhenCurrentStatus: 'INACTIVE' },
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'CALCULATE_PRORATED_REFUND',
        config: { stepKey: 'wc15_refund', label: 'Prorrateo devolución' },
      },
    ],
  }),
  defineProclubWorkflow('WC-16', {
    area: 'billing',
    automation: 'auto',
    phase: 4,
    name: 'WC-16 · Gestión de bono / saldo a favor',
    description: 'Saldo a favor aplicado en próximo cobro.',
    triggerType: 'MEMBER_CREDIT_APPLIED',
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP',
        config: {
          stepKey: 'wc16_wa',
          label: 'Aviso saldo a favor',
          waPhone: '{guardianPhone}',
          waMessage: 'Se ha aplicado un saldo a favor de {creditAmount} € en la cuota de {memberName}.',
        },
      },
    ],
  }),
  defineProclubWorkflow('WC-17', {
    area: 'billing',
    automation: 'mixed',
    phase: 4,
    name: 'WC-17 · Renovación de temporada',
    description: 'Campaña de renovación al tutor.',
    triggerType: 'SEASON_RENEWAL_DUE',
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'GENERATE_RESPONSE_LINK',
        config: { stepKey: 'wc17_link', label: 'Enlace renovación', linkType: 'SEASON_RENEWAL' },
      },
      {
        position: 1,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP',
        config: {
          stepKey: 'wc17_wa',
          label: 'Propuesta renovación',
          waPhone: '{guardianPhone}',
          waMessage: 'Renovación de temporada para {memberName}. Confirma aquí: {responseLink}',
        },
      },
    ],
  }),
  defineProclubWorkflow('WC-18', {
    area: 'billing',
    automation: 'auto',
    phase: 4,
    name: 'WC-18 · Cierre contable y export para gestoría',
    description: 'Fin de mes: notificar admin que el export está listo.',
    triggerType: 'ACCOUNTING_EXPORT_DUE',
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP',
        config: {
          stepKey: 'wc18_admin',
          label: 'Export listo',
          waPhone: '{clubAdminPhone}',
          waMessage: 'Cierre contable del periodo disponible en el CRM (Informes → Export).',
        },
      },
    ],
  }),
]
