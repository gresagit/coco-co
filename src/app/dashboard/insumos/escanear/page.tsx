import EscanerInsumos from "@/components/EscanerInsumos";

export default function EscanearInsumosPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1">Catálogo · 03</p>
        <h1 className="page-title">Escanear insumos</h1>
        <p className="page-subtitle">
          Escanea el código de barra de un insumo con un lector Bluetooth o con la cámara del teléfono para
          registrar un derrame al instante, o abrir su ficha completa y editar cantidad, nombre, marca o
          cualquier otro dato.
        </p>
      </div>

      <EscanerInsumos />
    </div>
  );
}
