-- ============================================================================
-- COCO & CO. — SISTEMA DE INVENTARIOS EN LA NUBE
-- Esquema de base de datos (PostgreSQL / Supabase)
-- Version 2.0 - Agosto 2026
-- ============================================================================
-- Ejecutar este archivo completo en: Supabase Dashboard > SQL Editor > New query
-- ============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ============================================================================
-- 1. SUCURSALES
-- ============================================================================
create table sucursales (
  id uuid primary key default uuid_generate_v4(),
  nombre text not null unique,
  direccion text,
  responsable text,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 2. USUARIOS, ROLES Y PERMISOS
-- ============================================================================
create table roles (
  id uuid primary key default uuid_generate_v4(),
  nombre text not null unique, -- Administrador, Compras, Produccion, Ventas/Almacen, Solo consulta, o personalizado
  es_base boolean not null default false,
  permisos jsonb not null default '{}'::jsonb, -- { "productos": ["ver","crear","editar"], "compras": [...], ... }
  temporal boolean not null default false,
  vigente_desde date,
  vigente_hasta date,
  created_at timestamptz not null default now()
);

create table usuarios (
  id uuid primary key default uuid_generate_v4(),
  usuario text not null unique,       -- login (ej. "Admin")
  nombre_completo text not null,
  password_hash text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table usuario_roles (
  usuario_id uuid references usuarios(id) on delete cascade,
  rol_id uuid references roles(id) on delete cascade,
  primary key (usuario_id, rol_id)
);

-- Alcance por sucursal: NULL en sucursal_id via tabla vacia = sin restriccion (todas)
create table usuario_sucursales (
  usuario_id uuid references usuarios(id) on delete cascade,
  sucursal_id uuid references sucursales(id) on delete cascade,
  primary key (usuario_id, sucursal_id)
);
-- Si un usuario tiene 0 filas aqui y su rol es Administrador, se asume acceso a todas.
alter table usuarios add column acceso_todas_sucursales boolean not null default false;

-- ============================================================================
-- 3. PROVEEDORES
-- ============================================================================
create table proveedores (
  id uuid primary key default uuid_generate_v4(),
  nombre text not null,
  contacto text,
  telefono text,
  email text,
  tiempo_entrega_dias integer,
  condiciones_pago text,
  pedido_minimo numeric(12,2),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 4. INSUMOS (Materia Prima / Empaque / Etiquetas / Producto Intermedio)
-- ============================================================================
create table insumos (
  id uuid primary key default uuid_generate_v4(),
  codigo_interno text not null unique,
  nombre text not null,
  marca text, -- opcional: proveedor/fabricante del insumo
  tipo text not null check (tipo in ('Materia Prima','Empaque','Etiqueta','Producto Intermedio')),
  unidad_medida text not null check (unidad_medida in ('kg','g','L','ml','pz','m')),
  controla_caducidad boolean not null default false, -- activa FEFO
  costo_unitario_actual numeric(12,4) not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table insumo_proveedores (
  insumo_id uuid references insumos(id) on delete cascade,
  proveedor_id uuid references proveedores(id) on delete cascade,
  precio_historico numeric(12,4),
  es_preferido boolean not null default false,
  primary key (insumo_id, proveedor_id)
);

-- Stock de insumos, independiente por sucursal
create table insumo_stock (
  id uuid primary key default uuid_generate_v4(),
  insumo_id uuid not null references insumos(id) on delete cascade,
  sucursal_id uuid not null references sucursales(id) on delete cascade,
  stock_minimo numeric(12,4) not null default 0,
  cantidad_disponible numeric(12,4) not null default 0,
  unique (insumo_id, sucursal_id)
);

-- Lotes de insumo con caducidad (FEFO) — solo aplica si controla_caducidad = true
create table insumo_lotes (
  id uuid primary key default uuid_generate_v4(),
  insumo_id uuid not null references insumos(id) on delete cascade,
  sucursal_id uuid not null references sucursales(id) on delete cascade,
  folio_lote text not null,
  fecha_caducidad date,
  cantidad_inicial numeric(12,4) not null,
  cantidad_restante numeric(12,4) not null,
  costo_subtotal numeric(14,2),
  costo_total numeric(14,2),      -- lo pagado en total por esta compra/lote (si aplica)
  costo_unitario numeric(12,4),   -- costo_total / cantidad_inicial, calculado (kg, L, pieza, etc.)
  iva_porcentaje numeric(6,3) not null default 0,
  iva_incluido boolean not null default false,
  iva_total numeric(14,2) not null default 0,
  envio_total numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);
create index idx_insumo_lotes_fefo on insumo_lotes (insumo_id, sucursal_id, fecha_caducidad asc);

-- ============================================================================
-- 5. PRODUCTOS TERMINADOS
-- ============================================================================
create table categorias (
  id uuid primary key default uuid_generate_v4(),
  nombre text not null unique
);

create table productos (
  id uuid primary key default uuid_generate_v4(),
  sku text not null unique,
  nombre text not null,
  categoria_id uuid references categorias(id),
  presentacion text not null,
  unidad_venta text not null check (unidad_venta in ('pz','kg','L')),
  porcentaje_margen_deseado numeric(6,4) not null default 0.30, -- 0.30 = 30%
  precio_venta_override numeric(12,4), -- si se llena, ignora el sugerido
  es_insumo_de_otro boolean not null default false, -- activa receta anidada
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Stock de producto terminado, independiente por sucursal
create table producto_stock (
  id uuid primary key default uuid_generate_v4(),
  producto_id uuid not null references productos(id) on delete cascade,
  sucursal_id uuid not null references sucursales(id) on delete cascade,
  stock_minimo numeric(12,4) not null default 0,
  cantidad_disponible numeric(12,4) not null default 0,
  unique (producto_id, sucursal_id)
);

-- Folio correlativo por producto (ej. JAB-0001)
create table folio_contadores (
  producto_id uuid primary key references productos(id) on delete cascade,
  prefijo text not null,
  ultimo_numero integer not null default 0
);

-- ============================================================================
-- 6. BOM (Fórmulas / Recetas) — tabla única, soporta recetas anidadas
-- Un producto puede llevar como insumo otro producto (es_insumo_de_otro=true)
-- o un insumo de tipo "Producto Intermedio". Por eso el BOM referencia
-- insumo_id (catálogo de insumos) O producto_id (producto usado como insumo).
-- ============================================================================
create table bom (
  id uuid primary key default uuid_generate_v4(),
  producto_id uuid not null references productos(id) on delete cascade, -- producto que se fabrica
  insumo_id uuid references insumos(id) on delete cascade,               -- insumo directo (si aplica)
  insumo_producto_id uuid references productos(id) on delete cascade,   -- otro producto usado como insumo (receta anidada)
  cantidad_por_unidad numeric(14,6) not null,
  unidad text not null,
  check (
    (insumo_id is not null and insumo_producto_id is null) or
    (insumo_id is null and insumo_producto_id is not null)
  )
);

-- ============================================================================
-- 7. TRAZABILIDAD: PIEZA -> LOTE -> ORDEN DE PRODUCCION -> SKU
-- ============================================================================
create table ordenes_produccion (
  id uuid primary key default uuid_generate_v4(),
  folio text not null unique,
  producto_id uuid not null references productos(id),
  sucursal_id uuid not null references sucursales(id),
  cantidad_planeada numeric(14,4) not null,
  frecuencia_reporte text not null default 'semanal' check (frecuencia_reporte in ('diario','semanal','mensual')),
  estado text not null default 'Abierta' check (estado in ('Abierta','En proceso','Cerrada','Cancelada')),
  aprobacion_estado text not null default 'Pendiente' check (aprobacion_estado in ('Pendiente','Aprobada','Rechazada')),
  aprobado_por uuid references usuarios(id),
  aprobado_en timestamptz,
  comentario_aprobacion text,
  creado_por uuid references usuarios(id),
  created_at timestamptz not null default now()
);

create table lotes (
  id uuid primary key default uuid_generate_v4(),
  folio_lote text not null unique, -- ej. JAB-0001-L01
  orden_produccion_id uuid not null references ordenes_produccion(id) on delete cascade,
  producto_id uuid not null references productos(id),
  sucursal_id uuid not null references sucursales(id),
  cantidad_total numeric(14,4) not null default 0,
  fecha_produccion date not null default current_date,
  created_at timestamptz not null default now()
);

create table piezas (
  id uuid primary key default uuid_generate_v4(),
  folio_pieza text not null unique, -- ej. JAB-0001 (correlativo por producto)
  lote_id uuid not null references lotes(id) on delete cascade,
  producto_id uuid not null references productos(id),
  sucursal_id uuid not null references sucursales(id),
  estado text not null default 'Disponible' check (estado in ('Disponible','Vendida','Dañada/Reimpresa','Transferida')),
  created_at timestamptz not null default now()
);

-- Reportes de avance de producción (declarativo + incremental)
create table reportes_avance (
  id uuid primary key default uuid_generate_v4(),
  orden_produccion_id uuid not null references ordenes_produccion(id) on delete cascade,
  lote_id uuid references lotes(id),
  fecha date not null default current_date,
  cantidad_producida numeric(14,4) not null default 0,
  cantidad_merma numeric(14,4) not null default 0,
  notas text,
  reportado_por uuid references usuarios(id),
  created_at timestamptz not null default now()
);

-- Consumo de insumos generado automáticamente por cada reporte de avance
-- (cantidad_producida + merma) x BOM, descontado proporcionalmente
create table reporte_consumo_insumos (
  id uuid primary key default uuid_generate_v4(),
  reporte_avance_id uuid not null references reportes_avance(id) on delete cascade,
  insumo_id uuid references insumos(id),
  insumo_producto_id uuid references productos(id),
  cantidad_consumida numeric(14,6) not null,
  insumo_lote_id uuid references insumo_lotes(id) -- si aplica FEFO
);

-- Reimpresión de etiquetas (mismo folio, margen de repuesto)
create table reimpresiones_etiqueta (
  id uuid primary key default uuid_generate_v4(),
  pieza_id uuid not null references piezas(id),
  motivo text,
  fecha timestamptz not null default now(),
  reimpreso_por uuid references usuarios(id)
);

-- ============================================================================
-- 8. MOVIMIENTOS DE INVENTARIO (entradas/salidas/transferencias)
-- ============================================================================
create table movimientos (
  id uuid primary key default uuid_generate_v4(),
  tipo text not null check (tipo in ('Entrada','Salida','Transferencia','Ajuste')),
  origen_tipo text not null check (origen_tipo in ('Producto','Insumo')),
  producto_id uuid references productos(id),
  insumo_id uuid references insumos(id),
  sucursal_id uuid references sucursales(id),          -- para Entrada/Salida/Ajuste
  sucursal_origen_id uuid references sucursales(id),    -- para Transferencia
  sucursal_destino_id uuid references sucursales(id),   -- para Transferencia
  cantidad numeric(14,4) not null,
  costo_subtotal numeric(14,2),
  costo_total numeric(14,2),      -- lo pagado en total por esta entrada (si aplica)
  costo_unitario numeric(12,4),   -- costo_total / cantidad, calculado (kg, L, pieza, etc.)
  iva_porcentaje numeric(6,3) not null default 0,
  iva_incluido boolean not null default false,
  iva_total numeric(14,2) not null default 0,
  envio_total numeric(14,2) not null default 0,
  estado text not null default 'Confirmado' check (estado in ('En tránsito','Recibida','Confirmado','Cancelada')),
  referencia text, -- folio de OC, orden de produccion, venta, etc.
  usuario_id uuid references usuarios(id),
  fecha timestamptz not null default now(),
  notas text
);
create index idx_movimientos_sucursal on movimientos (sucursal_id);
create index idx_movimientos_fecha on movimientos (fecha);

-- ============================================================================
-- 9. ÓRDENES DE COMPRA
-- ============================================================================
create table ordenes_compra (
  id uuid primary key default uuid_generate_v4(),
  folio text not null unique,
  proveedor_id uuid not null references proveedores(id),
  sucursal_id uuid not null references sucursales(id),
  fecha_emision date not null default current_date,
  fecha_entrega_esperada date,
  condiciones_pago text,
  estado text not null default 'Borrador' check (estado in ('Borrador','Enviada','Confirmada por proveedor','Recibida total','Recibida parcial','Cancelada')),
  aprobacion_estado text not null default 'Pendiente' check (aprobacion_estado in ('Pendiente','Aprobada','Rechazada')),
  aprobado_por uuid references usuarios(id),
  aprobado_en timestamptz,
  comentario_aprobacion text,
  total numeric(14,2) not null default 0,
  generado_por uuid references usuarios(id),
  created_at timestamptz not null default now()
);

create table orden_compra_items (
  id uuid primary key default uuid_generate_v4(),
  orden_compra_id uuid not null references ordenes_compra(id) on delete cascade,
  insumo_id uuid not null references insumos(id),
  cantidad numeric(14,4) not null,
  costo_subtotal numeric(14,2),
  costo_unitario numeric(12,4) not null,
  iva_porcentaje numeric(6,3) not null default 0,
  iva_incluido boolean not null default false,
  iva_total numeric(14,2) not null default 0,
  envio_total numeric(14,2) not null default 0,
  subtotal numeric(14,2) generated always as (cantidad * costo_unitario) stored,
  cantidad_recibida numeric(14,4) not null default 0
);

-- ============================================================================
-- 10. ALERTAS Y NOTIFICACIONES
-- ============================================================================
create table alertas_config (
  id uuid primary key default uuid_generate_v4(),
  rol_id uuid references roles(id),
  tipo_alerta text not null check (tipo_alerta in ('Insumo','Producto')),
  canal text not null check (canal in ('Sistema','Correo','WhatsApp')),
  frecuencia text not null default 'Inmediata' check (frecuencia in ('Inmediata','Resumen diario')),
  activo boolean not null default true
);

create table alertas_generadas (
  id uuid primary key default uuid_generate_v4(),
  tipo text not null check (tipo in ('Insumo','Producto')),
  insumo_id uuid references insumos(id),
  producto_id uuid references productos(id),
  sucursal_id uuid not null references sucursales(id),
  nivel text not null check (nivel in ('amarillo','rojo')), -- semaforo
  mensaje text not null,
  atendida boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 11. AUDITORÍA
-- ============================================================================
create table auditoria (
  id uuid primary key default uuid_generate_v4(),
  usuario_id uuid references usuarios(id),
  sucursal_id uuid references sucursales(id),
  accion text not null,       -- ej. "crear_producto", "recibir_oc", "reporte_avance"
  entidad text,                -- tabla afectada
  entidad_id uuid,
  detalle jsonb,
  fecha timestamptz not null default now()
);

-- ============================================================================
-- FUNCIONES / TRIGGERS DE APOYO
-- ============================================================================

-- Genera el siguiente folio correlativo por producto (ej. JAB-0001)
create or replace function siguiente_folio_producto(p_producto_id uuid)
returns text as $$
declare
  v_prefijo text;
  v_num integer;
begin
  select prefijo, ultimo_numero + 1 into v_prefijo, v_num
  from folio_contadores where producto_id = p_producto_id
  for update;

  if not found then
    raise exception 'No hay contador de folio configurado para este producto';
  end if;

  update folio_contadores set ultimo_numero = v_num where producto_id = p_producto_id;
  return v_prefijo || '-' || lpad(v_num::text, 4, '0');
end;
$$ language plpgsql;

-- updated_at helper (opcional, no todas las tablas lo requieren aqui)

-- ============================================================================
-- ROW LEVEL SECURITY (activar cuando se conecte Supabase Auth real)
-- Por ahora el login es manejado por la app (tabla usuarios) via server-side,
-- usando la service_role key en el backend. RLS queda deshabilitado para
-- simplificar la v1; se recomienda activarlo cuando se migre a Supabase Auth.
-- ============================================================================
-- alter table productos enable row level security;
-- (repetir por tabla y crear policies segun usuario_sucursales cuando aplique)

-- ============================================================================
-- SEED MÍNIMO: usuario administrador por defecto
-- Usuario: Admin  |  Password: cisco
-- El hash de abajo corresponde a bcrypt('cisco', 10). Cambiar en producción.
-- ============================================================================
insert into roles (nombre, es_base, permisos) values
  ('Administrador', true, '{"*": ["ver","crear","editar","eliminar"]}'),
  ('Compras', true, '{"proveedores":["ver","crear","editar"],"ordenes_compra":["ver","crear","editar"],"insumos":["ver","editar"]}'),
  ('Produccion', true, '{"produccion":["ver","crear","editar"],"insumos":["ver"],"productos":["ver"]}'),
  ('Ventas/Almacen', true, '{"movimientos":["ver","crear"],"productos":["ver"]}'),
  ('Solo consulta', true, '{"*": ["ver"]}');

insert into sucursales (nombre, direccion, responsable) values
  ('Matriz', 'Por definir', 'Por definir');

-- password_hash generado con bcrypt, 10 rounds, para "cisco"
insert into usuarios (usuario, nombre_completo, password_hash, activo, acceso_todas_sucursales)
values ('Admin', 'Administrador General', '$2b$10$Y5ZlmRFULxMxZ.sX/jftael5AzkYLFRvFzYJGwpCpq5O4ROjzrGf6', true, true);

insert into usuario_roles (usuario_id, rol_id)
select u.id, r.id from usuarios u, roles r where u.usuario = 'Admin' and r.nombre = 'Administrador';
