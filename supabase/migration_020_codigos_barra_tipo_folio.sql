-- MIGRACIÓN 020 — soporte para folios secuenciales o universales
-- Permite elegir un modo de numeración al generar etiquetas.

alter table generaciones_codigo_barra
  add column if not exists tipo_folio text not null default 'secuencial'
  check (tipo_folio in ('secuencial', 'universal'));

comment on column generaciones_codigo_barra.tipo_folio is 'Tipo de numeración del folio: secuencial por producto o universal no secuencial';
