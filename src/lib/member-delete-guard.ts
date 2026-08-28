import { prisma } from '@/lib/prisma'

/**
 * ¿Se puede borrar a este socio sin romper la contabilidad?
 *
 * Borrar un socio arrastra en cascada sus facturas. Si alguna llevaba cobros,
 * el dinero se queda en el libro —los movimientos y sus asientos no se
 * borran— pero desaparece la factura que lo justificaba, y con ella un número
 * correlativo del libro de facturas emitidas. Además «lo que nos deben» baja
 * sin que nadie haya pagado.
 *
 * Es exactamente lo que el borrado de una factura ya prohíbe con un 409; hasta
 * ahora se conseguía igual por la puerta de al lado, borrando al socio.
 *
 * Vive aparte porque hay TRES sitios que borran socios (la ruta de API, el
 * servicio y la acción en lote) y una guarda que solo esté en uno de ellos no
 * es una guarda.
 */
export async function motivoParaNoBorrarSocio(memberId: string): Promise<string | null> {
  const cobradas = await prisma.invoice.count({
    where: { memberId, paidAmount: { gt: 0 } },
  })
  if (cobradas === 0) return null

  return (
    `Este socio tiene ${cobradas} ${cobradas === 1 ? 'factura' : 'facturas'} con cobros registrados. ` +
    'Borrarlo dejaría ese ingreso en la contabilidad sin la factura que lo respalda. ' +
    'Cámbialo a inactivo, o anonimiza sus datos si lo que quieres es que no figure.'
  )
}
