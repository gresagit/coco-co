-- ============================================================================
-- MIGRACIÓN 004 — Escaneo de piezas (alta de producto terminado por código
-- de barras, con o sin escáner Bluetooth / cámara)
-- ============================================================================
-- Corre este script en Supabase DESPUÉS de migration_003_metas_produccion.sql

-- Quién y cuándo se confirmó cada pieza como producida (al escanearla).
alter table piezas add column if not exists escaneada_en timestamptz;
alter table piezas add column if not exists escaneada_por uuid references usuarios(id);

-- El consumo de insumos (BOM) hoy solo se podía ligar a un reporte de avance
-- por lote. Ahora también puede ligarse a una pieza individual confirmada
-- por escaneo, así que el vínculo a reporte_avance deja de ser obligatorio.
alter table reporte_consumo_insumos alter column reporte_avance_id drop not null;
alter table reporte_consumo_insumos add column if not exists pieza_id uuid references piezas(id) on delete cascade;
alter table reporte_consumo_insumos drop constraint if exists reporte_consumo_insumos_origen_check;
alter table reporte_consumo_insumos add constraint reporte_consumo_insumos_origen_check
  check (reporte_avance_id is not null or pieza_id is not null);
