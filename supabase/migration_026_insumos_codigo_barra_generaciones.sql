create table if not exists insumo_codigo_barra_generaciones (
  id uuid primary key default uuid_generate_v4(),
  insumo_id uuid not null references insumos(id) on delete cascade,
  cantidad integer not null default 0 check (cantidad >= 0),
  tipo_folio text not null default 'secuencial' check (tipo_folio in ('secuencial', 'universal')),
  created_at timestamptz not null default now()
);

create index if not exists idx_insumo_codigo_barra_generaciones_insumo
  on insumo_codigo_barra_generaciones (insumo_id, created_at desc);
