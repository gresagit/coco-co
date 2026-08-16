-- ============================================================================
-- MIGRACIÓN 005 — Marca de insumo + soporte para escaneo de insumos
-- ============================================================================
-- Corre este script en Supabase DESPUÉS de migration_004_escaneo.sql

-- Marca del insumo (ej. proveedor/fabricante del envase, la etiqueta, etc.),
-- opcional. Se usa en la ficha del insumo, que ahora se puede editar
-- directo desde el flujo de escaneo.
alter table insumos add column if not exists marca text;

-- Quién y cuándo se registró el último "derrame" (salida rápida) de un
-- insumo vía escaneo, para poder mostrarlo en su ficha si hace falta.
alter table movimientos add column if not exists motivo text;
