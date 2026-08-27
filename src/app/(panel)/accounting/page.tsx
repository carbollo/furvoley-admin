import { redirect } from 'next/navigation'

/**
 * Esta pantalla era una SEGUNDA contabilidad.
 *
 * Registraba movimientos sin crear asiento, así que sus cifras no cuadraban con
 * las de Contabilidad → Sumario, y las dos aparecían en el menú: el mismo
 * producto daba dos respuestas distintas a «cuánto tenemos». Se retira y su
 * dirección lleva a la contabilidad de verdad.
 *
 * Los movimientos que ya se registraron aquí NO se tocan: siguen en la base de
 * datos y se ven desde Contabilidad → Sumario y en los informes.
 *
 * Lo único que solo vivía aquí, el extracto bancario, conserva su ruta propia
 * (`/accounting/bank-import`) y su entrada en el menú.
 */
export default function AccountingPage() {
  redirect('/?tab=contabilidad')
}
