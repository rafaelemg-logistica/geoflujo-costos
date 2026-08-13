import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "GeoFlujo Costos | Rutas y costos con datos abiertos",
  description: "Selecciona puntos en el mapa, calcula rutas y estima costos logísticos sin ArcGIS ni licencias propietarias.",
  openGraph: {
    title: "GeoFlujo Costos",
    description: "Dibuja el recorrido. Entiende el costo.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "GeoFlujo Costos: mapa abierto y cálculo de rutas" }],
  },
  twitter: { card: "summary_large_image", title: "GeoFlujo Costos", description: "Rutas y costos con datos abiertos.", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
