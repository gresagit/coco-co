import bwipjs from "bwip-js/node";

// Genera un buffer PNG con un código de barras Code128 para el folio dado.
export async function generarBarcodePNG(texto: string): Promise<Buffer> {
  const png = await bwipjs.toBuffer({
    bcid: "code128",
    text: texto,
    scale: 3,
    height: 12,
    includetext: true,
    textxalign: "center",
  });
  return png;
}
