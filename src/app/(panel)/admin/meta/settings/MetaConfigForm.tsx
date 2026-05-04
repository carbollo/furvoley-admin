"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveMetaConfig } from "@/actions/meta";
import { Key, Hash, LayoutTemplate, ShieldAlert } from "lucide-react";

export default function MetaConfigForm({ initialData }: { initialData?: any }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    
    const data = {
      accessToken: formData.get("accessToken") as string,
      adAccountId: formData.get("adAccountId") as string,
      pageId: formData.get("pageId") as string || undefined,
    };

    const res = await saveMetaConfig(data);

    if (res.success) {
      router.push("/admin/meta");
    } else {
      setError(res.error || "Error al guardar la configuración");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 bg-white p-8 rounded-xl shadow-sm border border-gray-200">
      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4 text-red-700">
          <p>{error}</p>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start">
        <ShieldAlert className="w-6 h-6 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
        <div>
          <h4 className="text-sm font-bold text-blue-900">¿Cómo obtener estos datos?</h4>
          <p className="text-sm text-blue-800 mt-1">
            Necesitas crear una aplicación en <a href="https://developers.facebook.com" target="_blank" className="underline font-medium">Meta for Developers</a>, añadir el producto «API de marketing» y generar un token de acceso. El identificador de la cuenta publicitaria lo encontrarás en el Administrador comercial (Business Manager).
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Token de acceso *
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Key className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="password"
              name="accessToken"
              required
              defaultValue={initialData?.accessToken || ""}
              className="w-full rounded-md border border-gray-300 pl-10 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="EAABwz..."
            />
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Asegúrate de que el token tenga los permisos `ads_management` y `ads_read`.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            ID de la cuenta publicitaria *
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Hash className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              name="adAccountId"
              required
              defaultValue={initialData?.adAccountId || ""}
              className="w-full rounded-md border border-gray-300 pl-10 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="act_1234567890"
            />
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Puedes incluir o no el prefijo "act_".
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            ID de la página de Facebook (opcional)
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <LayoutTemplate className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              name="pageId"
              defaultValue={initialData?.pageId || ""}
              className="w-full rounded-md border border-gray-300 pl-10 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="10123456789"
            />
          </div>
        </div>
      </div>

      <div className="pt-6 border-t border-gray-200 flex justify-end space-x-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 font-medium transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {loading ? 'Guardando…' : 'Guardar configuración'}
        </button>
      </div>
    </form>
  );
}
