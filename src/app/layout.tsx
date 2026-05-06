import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Furvoley · Panel de administración",
  description: "Panel administrativo para la gestión de socios, cobros y actividades del club.",
};

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
