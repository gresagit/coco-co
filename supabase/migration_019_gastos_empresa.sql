-- MIGRACIÓN 019 — Gastos generales de la empresa
-- Ejecuta este script en Supabase para registrar egresos variables y graficarlos.

create table if not exists gastos_empresa (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  categoria text not null,
  concepto text not null,
  monto numeric(14,2) not null check (monto >= 0),
  proveedor text,
  referencia text,
  metodo_pago text,
  notas text,
  registrado_por uuid references usuarios(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_gastos_empresa_fecha on gastos_empresa(fecha desc);
create index if not exists idx_gastos_empresa_categoria on gastos_empresa(categoria);
