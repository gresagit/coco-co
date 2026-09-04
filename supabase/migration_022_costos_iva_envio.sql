-- MIGRACIÓN 022 — desglose del costo real de compras de insumos.
-- costo_total conserva el total final pagado para compatibilidad histórica.

alter table movimientos
  add column if not exists costo_subtotal numeric(14,2),
  add column if not exists iva_porcentaje numeric(6,3) not null default 0,
  add column if not exists iva_incluido boolean not null default false,
  add column if not exists iva_total numeric(14,2) not null default 0,
  add column if not exists envio_total numeric(14,2) not null default 0;

alter table insumo_lotes
  add column if not exists costo_subtotal numeric(14,2),
  add column if not exists iva_porcentaje numeric(6,3) not null default 0,
  add column if not exists iva_incluido boolean not null default false,
  add column if not exists iva_total numeric(14,2) not null default 0,
  add column if not exists envio_total numeric(14,2) not null default 0;

alter table orden_compra_items
  add column if not exists costo_subtotal numeric(14,2),
  add column if not exists iva_porcentaje numeric(6,3) not null default 0,
  add column if not exists iva_incluido boolean not null default false,
  add column if not exists iva_total numeric(14,2) not null default 0,
  add column if not exists envio_total numeric(14,2) not null default 0;