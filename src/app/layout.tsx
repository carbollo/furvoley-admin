import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import { getClubBranding } from "@/lib/club-settings";

const inter = Inter({ subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getClubBranding();
  const name = (branding.name || "Furvoley").trim() || "Furvoley";
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
      <body className={`${inter.className} bg-slate-50 text-slate-900 flex`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
