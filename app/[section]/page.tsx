import { notFound } from "next/navigation";
export default async function Section({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (
    ![
      "pos",
      "inventario",
      "ventas",
      "compras",
      "contactos",
      "gastos",
      "analisis",
      "reportes",
      "integraciones",
      "configuracion",
      "resumen",
    ].includes(section)
  )
    notFound();
  return null;
}
