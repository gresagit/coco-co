import test from "node:test";
import assert from "node:assert/strict";

import { normalizarCantidadAjuste } from "./codigos-barra";

test("reduce a lower count for a generation", () => {
  const resultado = normalizarCantidadAjuste(12, 7);

  assert.equal(resultado.accion, "reducir");
  assert.equal(resultado.diferencia, 5);
  assert.equal(resultado.nuevaCantidad, 7);
});

test("delete a generation when target is zero", () => {
  const resultado = normalizarCantidadAjuste(5, 0);

  assert.equal(resultado.accion, "eliminar");
  assert.equal(resultado.diferencia, 5);
  assert.equal(resultado.nuevaCantidad, 0);
});

test("increase a generation when target is higher", () => {
  const resultado = normalizarCantidadAjuste(3, 8);

  assert.equal(resultado.accion, "agregar");
  assert.equal(resultado.diferencia, 5);
  assert.equal(resultado.nuevaCantidad, 8);
});
