import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import ERP from "./components/erp";
const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
export const metadata: Metadata = {
  metadataBase: new URL(
    "https://abastelo-erp.sergiow.chatgpt.site",
  ),
  icons: { icon: "/favicon.ico", apple: "/icon-192.png" },
  applicationName: "Abástelo ERP",
  title: "Abástelo ERP",
  description:
    "Inventario, ventas, compras y reportes para comercios minoristas y mayoristas de Colombia.",
  openGraph: {
    title: "Abástelo ERP",
    description:
      "Inventario, ventas y reportes para comercio minorista y mayorista.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Abástelo ERP",
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
