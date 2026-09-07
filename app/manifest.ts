import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Abástelo ERP",
    short_name: "Abástelo",
    description: "Inventario, ventas y reportes.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f8f7",
    theme_color: "#087f73",
    lang: "es-CO",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
