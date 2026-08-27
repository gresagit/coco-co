-- ============================================================================
-- MIGRACION 016 - Permisos de apartados por usuario
-- ============================================================================
-- Ejecutar despues de migration_015_produccion_etapas.sql

alter table usuarios
  add column if not exists permisos jsonb not null default '{}'::jsonb;

-- Formato: { "productos": ["ver"], "ventas_pos": ["ver"] }
