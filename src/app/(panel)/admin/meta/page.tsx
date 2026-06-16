import { getMetaConfig, getLocalMetaCampaigns } from "@/actions/meta";
import Link from "next/link";
import { Settings, BarChart3, TrendingUp, Users, MousePointerClick, AlertTriangle } from "lucide-react";
import SyncButton from "./SyncButton";

export const dynamic = "force-dynamic";

export default async function MetaDashboardPage() {
  const { data: config } = await getMetaConfig();
  const { data: campaigns, success } = await getLocalMetaCampaigns();

  if (!config) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="text-center py-16 bg-white rounded-xl border border-stone-200 shadow-sm">
          <AlertTriangle className="mx-auto h-12 w-12 text-yellow-500 mb-4" />
          <h2 className="text-2xl font-bold text-stone-900">Meta Ads no configurado</h2>
          <p className="mt-2 text-stone-500 max-w-md mx-auto">
            Para ver el rendimiento de tus campañas, primero necesitas conectar tu cuenta de Meta (Facebook/Instagram Ads).
          </p>
          <div className="mt-6">
            <Link
              href="/admin/meta/settings"
              className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
            >
              <Settings className="w-5 h-5 mr-2" />
              Configurar Integración
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Calculate totals
  const totalSpend = campaigns?.reduce((sum, c) => sum + c.spend, 0) || 0;
  const totalImpressions = campaigns?.reduce((sum, c) => sum + c.impressions, 0) || 0;
  const totalClicks = campaigns?.reduce((sum, c) => sum + c.clicks, 0) || 0;
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-stone-900">Panel de Meta Ads</h1>
          <p className="text-stone-500 mt-1">
            Rendimiento de tus campañas en los últimos 30 días.
          </p>
        </div>
        <div className="flex space-x-4">
          <SyncButton />
          <Link
            href="/admin/meta/settings"
            className="inline-flex items-center px-4 py-2 bg-white border border-stone-300 text-stone-700 rounded-md hover:bg-stone-50 transition-colors font-medium shadow-sm"
          >
            <Settings className="w-5 h-5 mr-2" />
            Configuración
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-lg bg-blue-100 text-blue-600">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-stone-500">Gasto total</p>
              <h3 className="text-2xl font-bold text-stone-900">{totalSpend.toFixed(2)}€</h3>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-lg bg-purple-100 text-purple-600">
              <Users className="w-6 h-6" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-stone-500">Impresiones</p>
              <h3 className="text-2xl font-bold text-stone-900">{totalImpressions.toLocaleString()}</h3>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-lg bg-green-100 text-green-600">
              <MousePointerClick className="w-6 h-6" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-stone-500">Clics</p>
              <h3 className="text-2xl font-bold text-stone-900">{totalClicks.toLocaleString()}</h3>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-lg bg-orange-100 text-orange-600">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-stone-500">CTR / CPC Medio</p>
              <h3 className="text-xl font-bold text-stone-900">
                {avgCtr.toFixed(2)}% <span className="text-sm font-normal text-stone-500">/ {avgCpc.toFixed(2)}€</span>
              </h3>
            </div>
          </div>
        </div>
      </div>

      {/* Campaigns Table */}
      <div className="bg-white shadow-sm rounded-lg border border-stone-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-stone-200">
          <h3 className="text-lg font-medium leading-6 text-stone-900">Campañas Activas y Recientes</h3>
        </div>
        
        {campaigns && campaigns.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-stone-200">
              <thead className="bg-stone-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">
                    Campaña
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-stone-500 uppercase tracking-wider">
                    Gasto
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-stone-500 uppercase tracking-wider">
                    Impresiones
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-stone-500 uppercase tracking-wider">
                    Clics
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-stone-500 uppercase tracking-wider">
                    CTR
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-stone-500 uppercase tracking-wider">
                    CPC
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-stone-200">
                {campaigns.map((campaign) => {
                  const ctr = campaign.impressions > 0 ? (campaign.clicks / campaign.impressions) * 100 : 0;
                  const cpc = campaign.clicks > 0 ? campaign.spend / campaign.clicks : 0;
                  
                  return (
                    <tr key={campaign.id} className="hover:bg-stone-50">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-stone-900">{campaign.name}</span>
                          <span className="text-xs text-stone-500 mt-1">Obj: {campaign.objective || "N/A"}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          campaign.status === "ACTIVE" ? "bg-green-100 text-green-800" :
                          campaign.status === "PAUSED" ? "bg-yellow-100 text-yellow-800" :
                          "bg-stone-100 text-stone-800"
                        }`}>
                          {campaign.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-medium text-stone-900">
                        {campaign.spend.toFixed(2)}€
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-stone-500">
                        {campaign.impressions.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-stone-500">
                        {campaign.clicks.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-stone-500">
                        {ctr.toFixed(2)}%
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-stone-500">
                        {cpc.toFixed(2)}€
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <BarChart3 className="mx-auto h-12 w-12 text-stone-400" />
            <h3 className="mt-2 text-sm font-medium text-stone-900">No hay campañas sincronizadas</h3>
            <p className="mt-1 text-sm text-stone-500">
              Pulsa el botón "Sincronizar Datos" para importar tus campañas desde Meta.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
