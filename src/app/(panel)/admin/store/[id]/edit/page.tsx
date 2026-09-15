"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { getProductById, updateProduct } from "@/actions/store";
import { Package, Euro, Tag, Image as ImageIcon, FileText, Hash, ChevronLeft } from "lucide-react";
import Link from "next/link";

/**
 * Edición de un producto de la tienda.
 *
 * Esta página no existía: el botón «Editar» del catálogo apuntaba a
 * `/admin/store/<id>/edit` desde el principio y devolvía un 404, así que no se
 * podía cambiar ni un precio sin borrar el producto y volver a crearlo. El
 * trabajo de servidor (`getProductById`, `updateProduct`) sí estaba hecho; lo
 * único que faltaba era la pantalla.
 *
 * Se mandan los campos del formulario y ninguno más. `updateProduct` acepta un
 * objeto parcial, así que lo que la pantalla no muestra —el tipo de cobro, la
 * periodicidad y el plan de cuota vinculado de un producto de suscripción— se
 * queda como estaba en vez de borrarse al guardar un cambio de precio.
 */

type Producto = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  image: string | null;
  category: string | null;
  isActive: boolean;
};

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = String(params?.id || "");

  const [producto, setProducto] = useState<Producto | null>(null);
  const [cargando, setCargando] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let vigente = true;
    (async () => {
      const res = await getProductById(id);
      if (!vigente) return;
      if (res.success && res.data) setProducto(res.data as Producto);
      else setError(res.error || "No se encontró el producto");
      setCargando(false);
    })();
    return () => {
      vigente = false;
    };
  }, [id]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!producto) return;
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const precio = parseFloat(formData.get("price") as string);
    const stock = parseInt(formData.get("stock") as string);

    if (!Number.isFinite(precio) || precio < 0) {
      setError("El precio no es válido.");
      setLoading(false);
      return;
    }
    if (!Number.isInteger(stock) || stock < 0) {
      setError("El stock no es válido.");
      setLoading(false);
      return;
    }

    const data = {
      name: (formData.get("name") as string) || "",
      description: ((formData.get("description") as string) || "") || null,
      price: precio,
      stock,
      image: ((formData.get("image") as string) || "") || null,
      category: ((formData.get("category") as string) || "") || null,
      isActive: formData.get("isActive") === "true",
    };

    const res = await updateProduct(producto.id, data);

    if (res.success) {
      router.push("/admin/store");
    } else {
      setError(res.error || "Error al guardar los cambios");
      setLoading(false);
    }
  };

  if (cargando) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <p className="text-stone-500">Cargando el producto…</p>
      </div>
    );
  }

  if (!producto) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Link
          href="/admin/store"
          className="inline-flex items-center text-sm font-medium text-stone-500 hover:text-stone-700 mb-4 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Volver a la Tienda
        </Link>
        <div className="bg-red-50 border-l-4 border-red-400 p-4 text-red-700">
          <p>{error || "No se encontró el producto."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <Link
          href="/admin/store"
          className="inline-flex items-center text-sm font-medium text-stone-500 hover:text-stone-700 mb-4 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Volver a la Tienda
        </Link>
        <h1 className="text-3xl font-bold text-stone-900">Editar Producto</h1>
        <p className="text-stone-500 mt-1">
          Cambia el precio, el stock o los datos de «{producto.name}». Los cambios se ven en la
          tienda al guardar.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8 bg-white p-8 rounded-xl shadow-sm border border-stone-200">
        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 text-red-700">
            <p>{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Columna Izquierda: Info Básica */}
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Nombre del Producto *</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Package className="h-4 w-4 text-stone-400" />
                </div>
                <input
                  type="text"
                  name="name"
                  required
                  defaultValue={producto.name}
                  className="w-full rounded-md border border-stone-300 pl-10 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Ej: Camiseta Oficial 2026"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Precio (€) *</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Euro className="h-4 w-4 text-stone-400" />
                  </div>
                  <input
                    type="number"
                    name="price"
                    min="0"
                    step="0.01"
                    required
                    defaultValue={producto.price}
                    className="w-full rounded-md border border-stone-300 pl-10 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="25.00"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Stock *</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Hash className="h-4 w-4 text-stone-400" />
                  </div>
                  <input
                    type="number"
                    name="stock"
                    min="0"
                    required
                    defaultValue={producto.stock}
                    className="w-full rounded-md border border-stone-300 pl-10 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="10"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Categoría</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Tag className="h-4 w-4 text-stone-400" />
                </div>
                <input
                  type="text"
                  name="category"
                  defaultValue={producto.category || ""}
                  className="w-full rounded-md border border-stone-300 pl-10 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Ej: Ropa, Accesorios, Equipación"
                  list="categories"
                />
                <datalist id="categories">
                  <option value="Equipación Oficial" />
                  <option value="Ropa de Entrenamiento" />
                  <option value="Accesorios" />
                  <option value="Material Deportivo" />
                </datalist>
              </div>
            </div>
          </div>

          {/* Columna Derecha: Detalles */}
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">URL de la Imagen</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <ImageIcon className="h-4 w-4 text-stone-400" />
                </div>
                <input
                  type="url"
                  name="image"
                  defaultValue={producto.image || ""}
                  className="w-full rounded-md border border-stone-300 pl-10 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="https://ejemplo.com/imagen.jpg"
                />
              </div>
              <p className="mt-1 text-xs text-stone-500">Pega el enlace de una imagen para mostrarla en la tienda.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Descripción</label>
              <div className="relative">
                <div className="absolute top-3 left-3 pointer-events-none">
                  <FileText className="h-4 w-4 text-stone-400" />
                </div>
                <textarea
                  name="description"
                  rows={4}
                  defaultValue={producto.description || ""}
                  className="w-full rounded-md border border-stone-300 pl-10 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Tallas disponibles, materiales, cuidados..."
                ></textarea>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Estado</label>
              <div className="flex items-center space-x-4 mt-2">
                <label className="inline-flex items-center">
                  <input
                    type="radio"
                    name="isActive"
                    value="true"
                    defaultChecked={producto.isActive}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-stone-300"
                  />
                  <span className="ml-2 text-sm text-stone-900">Activo (Visible en tienda)</span>
                </label>
                <label className="inline-flex items-center">
                  <input
                    type="radio"
                    name="isActive"
                    value="false"
                    defaultChecked={!producto.isActive}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-stone-300"
                  />
                  <span className="ml-2 text-sm text-stone-900">Inactivo (Oculto)</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-stone-200 flex justify-end space-x-4">
          <button
            type="button"
            onClick={() => router.push("/admin/store")}
            className="px-6 py-2 border border-stone-300 rounded-md text-stone-700 hover:bg-stone-50 font-medium transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {loading ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </form>
    </div>
  );
}
