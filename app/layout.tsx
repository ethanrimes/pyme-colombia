import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import ERP from "./components/erp";
const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
export const metadata: Metadata = {
  metadataBase: new URL(
    "https://nexo-erp-colombia.mythic-lemon-5739.chatgpt.site",
  ),
  icons: { icon: "/favicon.ico", apple: "/icon-192.png" },
  applicationName: "Nexo ERP",
  title: "Nexo ERP",
  description:
    "Inventario, ventas, compras y reportes para comercios minoristas y mayoristas de Colombia.",
  openGraph: {
    title: "Nexo ERP",
    description:
      "Inventario, ventas y reportes para comercio minorista y mayorista.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Nexo ERP",
    description: "El ERP para las PyMEs de Colombia.",
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es-CO">
      <body className={geist.variable}>
        <ERP>{children}</ERP>
      </body>
    </html>
  );
}
