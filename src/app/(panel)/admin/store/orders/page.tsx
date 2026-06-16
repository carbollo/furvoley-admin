import { getOrders } from "@/actions/store";
import Link from "next/link";
import { ChevronLeft, ShoppingBag, Clock, CheckCircle, Truck, XCircle, Package } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  const { data: orders, success } = await getOrders();

  if (!success) {
    return <div className="p-8 text-red-500">Error al cargar los pedidos.</div>;
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800"><Clock className="w-3 h-3 mr-1"/> Pendiente</span>;
      case "PAID":
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"><CheckCircle className="w-3 h-3 mr-1"/> Pagado</span>;
      case "PROCESSING":
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800"><Package className="w-3 h-3 mr-1"/> Preparando</span>;
      case "SHIPPED":
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800"><Truck className="w-3 h-3 mr-1"/> Enviado</span>;
      case "DELIVERED":
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1"/> Entregado</span>;
      case "CANCELLED":
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"><XCircle className="w-3 h-3 mr-1"/> Cancelado</span>;
      default:
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-stone-100 text-stone-800">{status}</span>;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <Link
          href="/admin/store"
          className="inline-flex items-center text-sm font-medium text-stone-500 hover:text-stone-700 mb-4 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Volver a la Tienda
        </Link>
        <h1 className="text-3xl font-bold text-stone-900">Pedidos de la Tienda</h1>
        <p className="text-stone-500 mt-1">
          Gestiona los pedidos realizados por los miembros y el público.
        </p>
      </div>

      <div className="bg-white shadow-sm rounded-lg border border-stone-200 overflow-hidden">
        {orders && orders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-stone-200">
              <thead className="bg-stone-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">
                    Pedido
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">
                    Cliente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-stone-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-stone-200">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-stone-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-stone-900">
                          {order.orderNumber}
                        </span>
                        <span className="text-xs text-stone-500 mt-1">
                          {new Date(order.createdAt).toLocaleDateString("es-ES")}
                        </span>
                        <span className="text-xs text-stone-500 mt-1">
                          {order.items.length} artículo(s)
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col text-sm text-stone-900">
                        <span className="font-medium">{order.customerName}</span>
                        {order.customerEmail && (
                          <span className="text-stone-500 text-xs">{order.customerEmail}</span>
                        )}
                        {order.memberId && (
                          <span className="inline-flex items-center px-2 py-0.5 mt-1 rounded text-[10px] font-medium bg-blue-100 text-blue-800 w-fit">
                            Miembro del Club
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(order.status)}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-stone-900">
                        {order.totalAmount.toFixed(2)}€
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium">
                      <Link
                        href={`/admin/store/orders/${order.id}`}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Gestionar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <ShoppingBag className="mx-auto h-12 w-12 text-stone-400" />
            <h3 className="mt-2 text-sm font-medium text-stone-900">No hay pedidos aún</h3>
            <p className="mt-1 text-sm text-stone-500">
              Cuando los usuarios compren en la tienda, sus pedidos aparecerán aquí.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
