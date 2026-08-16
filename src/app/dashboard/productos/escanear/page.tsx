import EscanerInventario from "@/components/EscanerInventario";

export default function EscanearPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1">Catálogo · 01</p>
        <h1 className="page-title">Escanear inventario</h1>
        <p className="page-subtitle">
          Cada pieza terminada ya trae su código de barra. Escanéala con un lector Bluetooth o con la cámara del
          teléfono y se suma sola al stock — sin capturar nada a mano.
        </p>
      </div>

      <EscanerInventario />
    </div>
  );
}
