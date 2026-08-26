/** WD-3 · Enviar el enlace de cobro por WhatsApp al dar de alta con pago obligatorio. */

export const WD3_CATALOG_ID = 'WD-3'

export const WD3_WORKFLOW = {
  name: 'WD-3 · Cobro al alta por WhatsApp',
  description:
    '[WD-3] Cuando se da de alta un socio con una cuota que exige pago, le envía por WhatsApp el enlace para pagarla. Edita el texto a tu gusto y actívalo cuando tengas la pasarela de cobro conectada.',
  triggerType: 'ENROLLMENT_PAYMENT_DUE',
  triggerConfig: {
    catalogId: WD3_CATALOG_ID,
  },
  // Apagado de fábrica: manda mensajes a clientes reales, así que lo enciende el
  // club a propósito (y cuando ya tenga la pasarela lista), no por abrir la pestaña.
  isActive: false,
  steps: [
    {
      position: 0,
      stepType: 'ACTION',
      actionType: 'SEND_WHATSAPP',
      config: {
        stepKey: 'wd3_cobro',
        label: 'Enviar enlace de cobro al socio',
        waSessionId: '',
        // El tutor cuando el socio es menor; si no hay tutor, cae al del socio.
        // Con {memberPhone} a secas, un menor sin teléfono propio no recibiría nada.
        waPhone: '{guardianPhone}',
        waMessage:
          '¡Hola {memberName}! 👋\n\n' +
          'Ya casi está: para completar tu inscripción solo falta abonar la cuota de {importe_pendiente} €.\n\n' +
          'Puedes pagarla aquí:\n{enlace_cobro}\n\n' +
          'En cuanto se confirme el pago te damos de alta automáticamente. ¡Nos vemos pronto!',
      },
    },
  ],
} as const
