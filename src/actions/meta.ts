"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// --- META CONFIGURATION ---

export async function getMetaConfig() {
  try {
    const config = await prisma.metaConfig.findFirst({
      where: { isActive: true },
    });
    return { success: true, data: config };
  } catch (error) {
    console.error("Error fetching Meta config:", error);
    return { success: false, error: "Error al obtener la configuración de Meta" };
  }
}

export async function saveMetaConfig(data: {
  accessToken: string;
  adAccountId: string;
  pageId?: string;
}) {
  try {
    // Desactivar configuraciones anteriores
    await prisma.metaConfig.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    // Crear la nueva
    const config = await prisma.metaConfig.create({
      data: {
        ...data,
        isActive: true,
      },
    });

    revalidatePath("/admin/meta");
    return { success: true, data: config };
  } catch (error) {
    console.error("Error saving Meta config:", error);
    return { success: false, error: "Error al guardar la configuración de Meta" };
  }
}

// --- META GRAPH API INTEGRATION ---

// Helper function to fetch from Meta Graph API
async function fetchFromMetaAPI(endpoint: string, accessToken: string) {
  const url = `https://graph.facebook.com/v19.0/${endpoint}&access_token=${accessToken}`;
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.error) {
    throw new Error(data.error.message || "Error en la API de Meta");
  }
  
  return data;
}

export async function syncMetaCampaigns() {
  try {
    const config = await prisma.metaConfig.findFirst({
      where: { isActive: true },
    });

    if (!config) {
      return { success: false, error: "No hay configuración activa de Meta Ads. Por favor, configúrala primero." };
    }

    // 1. Fetch Campaigns
    // Format adAccountId correctly (usually starts with 'act_')
    const accountId = config.adAccountId.startsWith('act_') ? config.adAccountId : `act_${config.adAccountId}`;
    
    // Fetch campaigns with their insights (metrics) for the last 30 days
    const endpoint = `${accountId}/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget,insights.date_preset(last_30d){spend,impressions,clicks,reach}`;
    
    const response = await fetchFromMetaAPI(endpoint, config.accessToken);
    
    if (!response.data || !Array.isArray(response.data)) {
      return { success: false, error: "Formato de respuesta inesperado de la API de Meta" };
    }

    // 2. Update Database
    let syncedCount = 0;
    
    for (const campaign of response.data) {
      const insights = campaign.insights?.data?.[0] || {};
      
      await prisma.metaCampaign.upsert({
        where: { campaignId: campaign.id },
        update: {
          name: campaign.name,
          status: campaign.status,
          objective: campaign.objective,
          dailyBudget: campaign.daily_budget ? parseFloat(campaign.daily_budget) / 100 : null, // Meta returns budget in cents
          lifetimeBudget: campaign.lifetime_budget ? parseFloat(campaign.lifetime_budget) / 100 : null,
          spend: insights.spend ? parseFloat(insights.spend) : 0,
          impressions: insights.impressions ? parseInt(insights.impressions) : 0,
          clicks: insights.clicks ? parseInt(insights.clicks) : 0,
          reach: insights.reach ? parseInt(insights.reach) : 0,
          lastSyncedAt: new Date(),
        },
        create: {
          campaignId: campaign.id,
          name: campaign.name,
          status: campaign.status,
          objective: campaign.objective,
          dailyBudget: campaign.daily_budget ? parseFloat(campaign.daily_budget) / 100 : null,
          lifetimeBudget: campaign.lifetime_budget ? parseFloat(campaign.lifetime_budget) / 100 : null,
          spend: insights.spend ? parseFloat(insights.spend) : 0,
          impressions: insights.impressions ? parseInt(insights.impressions) : 0,
          clicks: insights.clicks ? parseInt(insights.clicks) : 0,
          reach: insights.reach ? parseInt(insights.reach) : 0,
        },
      });
      syncedCount++;
    }

    revalidatePath("/admin/meta");
    return { success: true, message: `${syncedCount} campañas sincronizadas correctamente.` };
    
  } catch (error: any) {
    console.error("Error syncing Meta campaigns:", error);
    return { success: false, error: error.message || "Error al sincronizar con Meta Ads" };
  }
}

export async function getLocalMetaCampaigns() {
  try {
    const campaigns = await prisma.metaCampaign.findMany({
      orderBy: { spend: 'desc' }, // Order by spend descending
    });
    return { success: true, data: campaigns };
  } catch (error) {
    console.error("Error fetching local campaigns:", error);
    return { success: false, error: "Error al obtener las campañas guardadas" };
  }
}
