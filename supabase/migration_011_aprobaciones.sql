-- ============================================================================
-- MIGRACIÓN 011 — Visto bueno del Administrador para Órdenes de Producción
-- y Órdenes de Compra
-- ============================================================================
-- Corre este script en Supabase DESPUÉS de migration_010_reparar_folio_contadores.sql
--
-- Agrega un flujo de aprobación: toda orden de producción y toda orden de
-- compra nace en estado de aprobación "Pendiente". Solo un usuario con rol
-- Administrador puede darle "Aprobada" o "Rechazada". Mientras no esté
-- aprobada, no se puede avanzar la orden (enviar a proveedor / recibir
-- mercancía en compras; reportar avance en producción).

alter table ordenes_compra
  add column if not exists aprobacion_estado text not null default 'Pendiente'
    check (aprobacion_estado in ('Pendiente', 'Aprobada', 'Rechazada')),
  add column if not exists aprobado_por uuid references usuarios(id),
  add column if not exists aprobado_en timestamptz,
  add column if not exists comentario_aprobacion text;

alter table ordenes_produccion
  add column if not exists aprobacion_estado text not null default 'Pendiente'
    check (aprobacion_estado in ('Pendiente', 'Aprobada', 'Rechazada')),
  add column if not exists aprobado_por uuid references usuarios(id),
  add column if not exists aprobado_en timestamptz,
  add column if not exists comentario_aprobacion text;

-- Las órdenes que ya existían antes de esta migración se dan por aprobadas
-- automáticamente para no bloquear operación en curso.
update ordenes_compra set aprobacion_estado = 'Aprobada', aprobado_en = now()
  where aprobacion_estado = 'Pendiente';
update ordenes_produccion set aprobacion_estado = 'Aprobada', aprobado_en = now()
  where aprobacion_estado = 'Pendiente';

create index if not exists idx_ordenes_compra_aprobacion on ordenes_compra(aprobacion_estado);
create index if not exists idx_ordenes_produccion_aprobacion on ordenes_produccion(aprobacion_estado);
