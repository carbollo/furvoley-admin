import { getProducts } from "@/actions/store";
import Link from "next/link";
import { Plus, Package, Euro, Tag, AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminStorePage() {
  const { data: products, success } = await getProducts(true);

  if (!success) {
    return <div className="p-8 text-red-500">Error al cargar los productos.</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-stone-900">Catálogo de Tienda</h1>
          <p className="text-stone-500 mt-1">
            Gestiona los productos, precios y stock de tu tienda.
          </p>
        </div>
        <div className="flex space-x-4">
          <Link
            href="/admin/store/orders"
            className="inline-flex items-center px-4 py-2 bg-white border border-stone-300 text-stone-700 rounded-md hover:bg-stone-50 transition-colors font-medium shadow-sm"
          >
            Ver Pedidos
          </Link>
          <Link
            href="/admin/store/new"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium shadow-sm"
          >
            <Plus className="w-5 h-5 mr-2" />
            Nuevo Producto
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {products && products.length > 0 ? (
          products.map((product) => (
            <div key={product.id} className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden flex flex-col hover:shadow-md transition-shadow">
              <div className="h-48 bg-stone-100 flex items-center justify-center relative">
                {product.image ? (
                  <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                  <Package className="w-12 h-12 text-stone-300" />
                )}
                {!product.isActive && (
                  <div className="absolute top-2 right-2 bg-red-100 text-red-800 text-xs font-bold px-2 py-1 rounded-full flex items-center shadow-sm">
                    <AlertCircle className="w-3 h-3 mr-1" /> Inactivo
                  </div>
                )}
              </div>
              <div className="p-5 flex-grow flex flex-col">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-lg font-bold text-stone-900 line-clamp-1" title={product.name}>
                    {product.name}
                  </h3>
                  <span className="font-bold text-blue-600 ml-2">{product.price}€</span>
                </div>
                
                {product.category && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-stone-100 text-stone-800 w-fit mb-3">
                    <Tag className="w-3 h-3 mr-1" /> {product.category}
                  </span>
                )}
                
                <p className="text-sm text-stone-500 line-clamp-2 mb-4 flex-grow">
                  {product.description || "Sin descripción"}
                </p>
                
                <div className="flex items-center justify-between mt-auto pt-4 border-t border-stone-100">
                  <div className="flex items-center text-sm">
                    <span className={`font-medium ${product.stock > 10 ? 'text-green-600' : product.stock > 0 ? 'text-orange-500' : 'text-red-500'}`}>
                      {product.stock} en stock
                    </span>
                  </div>
                  <Link
                    href={`/admin/store/${product.id}/edit`}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    Editar
                  </Link>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full text-center py-16 bg-white rounded-xl border border-stone-200 border-dashed">
            <Package className="mx-auto h-12 w-12 text-stone-300" />
            <h3 className="mt-2 text-sm font-medium text-stone-900">No hay productos</h3>
            <p className="mt-1 text-sm text-stone-500">
              Añade productos para empezar a vender equipaciones y merchandising.
            </p>
            <div className="mt-6">
              <Link
                href="/admin/store/new"
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-5 h-5 mr-2" />
                Nuevo Producto
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
