-- ============================================================================
-- MIGRACIÓN 003 — Metas de producción por sucursal
-- ============================================================================
-- Corre este script en Supabase > SQL Editor DESPUÉS de schema.sql y
-- migration_002_generador_codigos_barra.sql.
--
-- Qué hace:
--   1. Crea "metas_produccion": lo que Administración decide producir por
--      producto y sucursal, con fecha límite.
--   2. Al crear una meta, el sistema genera automáticamente sus códigos de
--      barra (uno por pieza) en estado "Pendiente" — impresos, pero aún no
--      confirmados como producidos.
--   3. Cuando esa pieza se escanea (fase siguiente del proyecto), pasa a
--      "Disponible", consume materia prima según el BOM y suma al stock de
--      producto terminado — eso se implementa en el siguiente paso.
-- ============================================================================

create table if not exists metas_produccion (
  id uuid primary key default uuid_generate_v4(),
  producto_id uuid not null references productos(id),
  sucursal_id uuid not null references sucursales(id),
  cantidad_meta integer not null check (cantidad_meta > 0),
  fecha_limite date,
  estado text not null default 'Activa' check (estado in ('Activa', 'Cumplida', 'Cancelada')),
  creado_por uuid references usuarios(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_metas_sucursal on metas_produccion (sucursal_id, estado);
create index if not exists idx_metas_producto on metas_produccion (producto_id);

-- Vincula cada pieza generada a la meta que la originó, para calcular avance.
alter table piezas add column if not exists meta_id uuid references metas_produccion(id);
create index if not exists idx_piezas_meta on piezas (meta_id);

-- Vincula cada tanda de códigos a la meta que la disparó (si aplica; las
-- generaciones manuales/de repuesto quedan con meta_id null salvo que
-- repongan una pieza de una meta existente).
alter table generaciones_codigo_barra add column if not exists meta_id uuid references metas_produccion(id);

-- Nuevo estado de pieza: "Pendiente" = código impreso, aún no confirmado
-- como producido. Solo el escaneo lo pasa a "Disponible".
alter table piezas drop constraint if exists piezas_estado_check;
alter table piezas add constraint piezas_estado_check
  check (estado in ('Pendiente', 'Disponible', 'Vendida', 'Dañada/Reimpresa', 'Transferida'));
