-- ============================================================================
-- MIGRACIÓN 012 — Agrupa varias líneas de producto bajo una misma venta
-- (ticket) en el punto de venta
-- ============================================================================
-- Corre este script en Supabase DESPUÉS de migration_011_aprobaciones.sql
--
-- Antes, cada venta en POS solo permitía registrar un producto a la vez.
-- Ahora el punto de venta permite agregar varios productos al carrito y
-- guardarlos todos juntos, en una sola operación. `venta_grupo_id` conecta
-- las líneas (una por producto) que pertenecen al mismo ticket de venta.

alter table ventas_pos
  add column if not exists venta_grupo_id uuid;

-- Para las ventas ya existentes (una línea = una venta), cada una se
-- considera su propio grupo.
update ventas_pos set venta_grupo_id = id where venta_grupo_id is null;

create index if not exists idx_ventas_pos_grupo on ventas_pos(venta_grupo_id);
