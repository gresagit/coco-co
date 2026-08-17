// Efecto visual: revienta unas "burbujitas de jabón" desde un punto de la
// pantalla. Se usa en la barra de herramientas para que cada click se sienta
// más juguetón. Manipula el DOM directamente (en vez de estado de React)
// porque son elementos efímeros que se crean y destruyen solos.
export function dispararBurbujas(origenX: number, origenY: number, cantidad = 7) {
  if (typeof document === "undefined") return;

  for (let n = 0; n < cantidad; n++) {
    const burbuja = document.createElement("span");
    burbuja.className = "burbuja-jabon";

    const tamano = 6 + Math.random() * 16; // px
    const dx = (Math.random() - 0.5) * 70; // deriva lateral
    const dy = -(40 + Math.random() * 55); // sube
    const duracion = 0.7 + Math.random() * 0.6; // s
    const retraso = Math.random() * 0.12; // s
    const jitterX = (Math.random() - 0.5) * 18;
    const jitterY = (Math.random() - 0.5) * 10;

    burbuja.style.width = `${tamano}px`;
    burbuja.style.height = `${tamano}px`;
    burbuja.style.left = `${origenX + jitterX - tamano / 2}px`;
    burbuja.style.top = `${origenY + jitterY - tamano / 2}px`;
    burbuja.style.setProperty("--burbuja-dx", `${dx}px`);
    burbuja.style.setProperty("--burbuja-dy", `${dy}px`);
    burbuja.style.setProperty("--burbuja-duracion", `${duracion}s`);
    burbuja.style.animationDelay = `${retraso}s`;

    document.body.appendChild(burbuja);
    burbuja.addEventListener("animationend", () => burbuja.remove());
    // Por si algo impide que dispare animationend, la quitamos de todos modos.
    setTimeout(() => burbuja.remove(), (duracion + retraso) * 1000 + 400);
  }
}
