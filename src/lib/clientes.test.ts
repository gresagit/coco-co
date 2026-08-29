import test from "node:test";
import assert from "node:assert/strict";

import { validarCliente, normalizarClienteDesdeFormulario } from "./clientes";

test("cliente ocasional requiere nombre, apellido y teléfono", () => {
  const resultado = validarCliente({
    nombre: "Ana",
    apellido: "López",
    telefono: "5551234567",
    es_mayorista: false,
  });

  assert.equal(resultado.ok, true);
});

test("cliente mayorista exige datos de empresa, responsable y origen", () => {
  const resultado = validarCliente({
    nombre: "Luis",
    apellido: "García",
    telefono: "5557654321",
    es_mayorista: true,
    nombre_empresa: "Distribuidora Cococo",
    nombre_responsable: "Patricia",
    correo_responsable: "patricia@distribuidora.com",
    lugar_origen: "Guadalajara",
    volumen_compra: "Grande",
  });

  assert.equal(resultado.ok, true);
});

test("formulario mayorista rechaza campos faltantes", () => {
  const resultado = validarCliente({
    nombre: "Luis",
    apellido: "García",
    telefono: "5557654321",
    es_mayorista: true,
    nombre_empresa: "Distribuidora Cococo",
  });

  assert.equal(resultado.ok, false);
  assert.match(resultado.message || "", /responsable|empresa|origen|volumen/i);
});

test("normalización del formulario toma los valores del cliente desde FormData", () => {
  const formData = new FormData();
  formData.set("cliente_tipo", "mayorista");
  formData.set("cliente_nombre", "Mónica");
  formData.set("cliente_apellido", "Zamora");
  formData.set("cliente_telefono", "5559993322");
  formData.set("cliente_email", "monica@correo.com");
  formData.set("cliente_empresa", "Cococo Mayoristas");
  formData.set("cliente_responsable", "Pedro");
  formData.set("cliente_telefono_responsable", "5551112233");
  formData.set("cliente_correo_responsable", "pedro@correo.com");
  formData.set("cliente_lugar_origen", "Monterrey");
  formData.set("cliente_volumen_compra", "Mensual");
  formData.set("cliente_productos_interes", "Jabones y detergentes");

  const cliente = normalizarClienteDesdeFormulario(formData);

  assert.equal(cliente.es_mayorista, true);
  assert.equal(cliente.nombre_empresa, "Cococo Mayoristas");
  assert.equal(cliente.nombre_responsable, "Pedro");
});
