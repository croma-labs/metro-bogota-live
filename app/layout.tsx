import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const title = "Metro de Bogotá · Croma";
const description = "La Línea 1 del Metro de Bogotá en 3D: cuánto va la obra mes a mes, cada árbol intervenido y, para cualquier punto de la ciudad, la estación más cercana y si es uno de los predios que necesita el metro, con la API de Croma.";

const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://metro.usecroma.com";
const image = { url: "/og.jpg", width: 1200, height: 630, alt: "La Línea 1 del Metro de Bogotá en 3D sobre el mapa de la ciudad" };

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title,
  description,
  openGraph: { title, description, siteName: "Croma", locale: "es_CO", type: "website", images: [image] },
  twitter: { card: "summary_large_image", title, description, images: [image] },
};

export const viewport: Viewport = { themeColor: "#0a0a0a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
