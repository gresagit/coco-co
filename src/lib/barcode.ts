import bwipjs from "bwip-js/node";

// Genera un buffer PNG con SOLO las barras del código (sin texto incrustado).
// Antes se generaba con `includetext: true`, lo que "horneaba" el folio como
// texto dentro de la misma imagen. Al insertar esa imagen en el PDF y
// escalarla para que quepa en la etiqueta, el texto se reducía junto con las
// barras y terminaba ilegible o "deforme". Ahora el texto se dibuja aparte,
// directo en el PDF con una fuente vectorial (ver etiquetas-pdf.ts), así
// siempre se ve nítido sin importar el tamaño de la etiqueta.
//
// `scale` se sube a 4 (antes 3) para que las barras salgan con más
// resolución y no se vean pixeladas o borrosas al imprimir.
export async function generarBarcodePNG(texto: string): Promise<Buffer> {
  const png = await bwipjs.toBuffer({
    bcid: "code128",
    text: texto,
    scale: 4,
    height: 12,
    includetext: false,
  });
  return png;
}
