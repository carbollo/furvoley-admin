"use client";

import { useState } from "react";
import { syncMetaCampaigns } from "@/actions/meta";
import { RefreshCw } from "lucide-react";

export default function SyncButton() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSync = async () => {
    setIsSyncing(true);
    setMessage(null);
    
    const result = await syncMetaCampaigns();
    
    if (result.success) {
      setMessage({ type: "success", text: result.message || "Sincronizado" });
    } else {
      setMessage({ type: "error", text: result.error || "Error al sincronizar" });
    }
    
    setIsSyncing(false);
    
    // Ocultar mensaje después de 5 segundos
    setTimeout(() => setMessage(null), 5000);
  };

  return (
    <div className="flex items-center space-x-3">
      {message && (
        <span className={`text-sm font-medium ${message.type === "success" ? "text-green-600" : "text-red-600"}`}>
          {message.text}
        </span>
      )}
      <button
        onClick={handleSync}
        disabled={isSyncing}
        className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <RefreshCw className={`w-5 h-5 mr-2 ${isSyncing ? "animate-spin" : ""}`} />
        {isSyncing ? "Sincronizando..." : "Sincronizar Datos"}
      </button>
    </div>
  );
}
