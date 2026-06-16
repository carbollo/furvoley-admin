import { getMetaConfig } from "@/actions/meta";
import MetaConfigForm from "./MetaConfigForm";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function MetaSettingsPage() {
  const { data: config } = await getMetaConfig();

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <Link
          href="/admin/meta"
          className="inline-flex items-center text-sm font-medium text-stone-500 hover:text-stone-700 mb-4 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Volver al panel
        </Link>
        <h1 className="text-3xl font-bold text-stone-900">Configuración de Meta Ads</h1>
        <p className="text-stone-500 mt-1">
          Conecta tu cuenta publicitaria para importar métricas de campañas automáticamente.
        </p>
      </div>

      <MetaConfigForm initialData={config} />
    </div>
  );
}
