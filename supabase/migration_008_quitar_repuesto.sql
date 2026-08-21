-- ============================================================================
-- MIGRACIÓN 008 — Quita el "% de etiquetas de repuesto" del generador de
-- códigos de barra
-- ============================================================================
-- Corre este script en Supabase DESPUÉS de migration_007_ventas.sql
--
-- El generador de códigos de barra ya no imprime un porcentaje "de repuesto"
-- suelto sin folio real. En su lugar, desde el detalle de cada tanda
-- (/dashboard/codigos-barra/[id]) se puede elegir exactamente qué etiquetas
-- se dañaron (una, varias sueltas, o un rango) y generar un PDF de reemplazo
-- solo con esas, reutilizando el folio que ya tenían. Ese reemplazo queda
-- registrado en la tabla "reimpresiones_etiqueta" que ya existía en el
-- esquema base — no hace falta tabla nueva.

alter table generaciones_codigo_barra drop column if exists porcentaje_repuesto;
