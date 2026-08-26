import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import "@/components/crm/crm-vars.css";
import Providers from "./providers";
import UmamiScript from "@/components/analytics/UmamiScript";
import { getClubBranding } from "@/lib/club-settings";
import { runWithTenant } from "@/lib/multitenant/request";

// Tipografía cálida y cercana (humanista, redondeada) para todo el panel.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-app",
});

export async function generateMetadata(): Promise<Metadata> {
  return runWithTenant(() => generateMetadataImpl());
}

async function generateMetadataImpl(): Promise<Metadata> {
  const branding = await getClubBranding();
  const name = (branding.name || "ProClubCRM").trim() || "ProClubCRM";
  return {
    title: `${name} · Panel de administración`,
    description: `Panel administrativo para la gestión de socios, cobros y actividades de ${name}.`,
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${jakarta.className} min-h-screen w-full`}
        style={{ background: "var(--surface)", color: "var(--text-primary)" }}
      >
        <Providers>{children}</Providers>
        <UmamiScript />
      </body>
    </html>
  );
}
