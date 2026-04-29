import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import RootShell from "./RootShell";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Furvoley Admin Panel",
  description: "Panel administrativo para gestión de socios y cobros.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${inter.className} bg-slate-50 text-slate-900 flex`}>
        <Providers>
          <RootShell>{children}</RootShell>
        </Providers>
      </body>
    </html>
  );
}
