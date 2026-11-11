-- Diagnostico de solo lectura para el CRM de usuarios.
-- Ejecutar en Supabase > SQL Editor. No modifica datos ni esquema.

-- 1. Tablas y columnas que usa la pantalla y el flujo de creacion.
WITH requeridos(tabla, columna) AS (
  VALUES
    ('usuarios', 'id'),
    ('usuarios', 'usuario'),
    ('usuarios', 'nombre_completo'),
    ('usuarios', 'password_hash'),
    ('usuarios', 'activo'),
    ('usuarios', 'acceso_todas_sucursales'),
    ('usuarios', 'permisos'),
    ('usuarios', 'created_at'),
    ('roles', 'id'),
    ('roles', 'nombre'),
    ('roles', 'es_base'),
    ('roles', 'temporal'),
    ('roles', 'vigente_desde'),
    ('roles', 'vigente_hasta'),
    ('roles', 'permisos'),
    ('sucursales', 'id'),
    ('sucursales', 'nombre'),
    ('sucursales', 'activa'),
    ('usuario_roles', 'usuario_id'),
    ('usuario_roles', 'rol_id'),
    ('usuario_sucursales', 'usuario_id'),
    ('usuario_sucursales', 'sucursal_id'),
    ('solicitudes_acceso', 'id'),
    ('solicitudes_acceso', 'nombre_completo'),
    ('solicitudes_acceso', 'usuario'),
    ('solicitudes_acceso', 'estado'),
    ('solicitudes_acceso', 'created_at')
)
SELECT
  r.tabla,
  r.columna,
  CASE
    WHEN t.table_name IS NULL THEN 'FALTA TABLA'
    WHEN c.column_name IS NULL THEN 'FALTA COLUMNA'
    ELSE 'OK'
  END AS resultado
FROM requeridos r
LEFT JOIN information_schema.tables t
  ON t.table_schema = 'public'
  AND t.table_name = r.tabla
  AND t.table_type = 'BASE TABLE'
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public'
  AND c.table_name = r.tabla
  AND c.column_name = r.columna
ORDER BY r.tabla, r.columna;

-- 2. Restricciones e indices definidos en las tablas del CRM.
SELECT
  tablas.relname AS tabla,
  'CONSTRAINT' AS tipo,
  restricciones.conname AS nombre,
  pg_get_constraintdef(restricciones.oid) AS definicion
FROM pg_class tablas
JOIN pg_namespace esquema ON esquema.oid = tablas.relnamespace
JOIN pg_constraint restricciones ON restricciones.conrelid = tablas.oid
WHERE esquema.nspname = 'public'
  AND tablas.relname IN (
    'usuarios', 'roles', 'sucursales',
    'usuario_roles', 'usuario_sucursales', 'solicitudes_acceso'
  )
  AND tablas.relkind IN ('r', 'p')
UNION ALL
SELECT
  tablas.relname AS tabla,
  'INDEX' AS tipo,
  indice.relname AS nombre,
  pg_get_indexdef(indice.oid) AS definicion
FROM pg_class tablas
JOIN pg_namespace esquema ON esquema.oid = tablas.relnamespace
JOIN pg_index indices ON indices.indrelid = tablas.oid
JOIN pg_class indice ON indice.oid = indices.indexrelid
WHERE esquema.nspname = 'public'
  AND tablas.relname IN (
    'usuarios', 'roles', 'sucursales',
    'usuario_roles', 'usuario_sucursales', 'solicitudes_acceso'
  )
  AND tablas.relkind IN ('r', 'p')
ORDER BY tabla, tipo, nombre;

-- 3. Indica si las tablas del CRM tienen Row Level Security activado.
SELECT
  c.relname AS tabla,
  c.relrowsecurity AS rls_activado,
  c.relforcerowsecurity AS rls_forzado
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'usuarios',
    'roles',
    'sucursales',
    'usuario_roles',
    'usuario_sucursales',
    'solicitudes_acceso'
  )
  AND c.relkind IN ('r', 'p')
ORDER BY c.relname;

-- 4. Nombres de usuario duplicados sin distinguir mayusculas/minusculas.
SELECT
  lower(usuario) AS usuario_normalizado,
  count(*) AS cantidad,
  array_agg(id ORDER BY id) AS ids
FROM public.usuarios
GROUP BY lower(usuario)
HAVING count(*) > 1
ORDER BY usuario_normalizado;

-- 5. Referencias y asignaciones duplicadas. Los conteos de huerfanos deben ser 0.
SELECT 'usuario_roles sin usuario' AS revision, count(*) AS cantidad
FROM public.usuario_roles ur
LEFT JOIN public.usuarios u ON u.id = ur.usuario_id
WHERE u.id IS NULL
UNION ALL
SELECT 'usuario_roles sin rol', count(*)
FROM public.usuario_roles ur
LEFT JOIN public.roles r ON r.id = ur.rol_id
WHERE r.id IS NULL
UNION ALL
SELECT 'usuario_sucursales sin usuario', count(*)
FROM public.usuario_sucursales us
LEFT JOIN public.usuarios u ON u.id = us.usuario_id
WHERE u.id IS NULL
UNION ALL
SELECT 'usuario_sucursales sin sucursal', count(*)
FROM public.usuario_sucursales us
LEFT JOIN public.sucursales s ON s.id = us.sucursal_id
WHERE s.id IS NULL
UNION ALL
SELECT 'asignaciones duplicadas de rol', count(*)
FROM (
  SELECT usuario_id, rol_id
  FROM public.usuario_roles
  GROUP BY usuario_id, rol_id
  HAVING count(*) > 1
) duplicados
UNION ALL
SELECT 'asignaciones duplicadas de sucursal', count(*)
FROM (
  SELECT usuario_id, sucursal_id
  FROM public.usuario_sucursales
  GROUP BY usuario_id, sucursal_id
  HAVING count(*) > 1
) duplicados
ORDER BY revision;

-- 6. Resumen de cuentas, roles y solicitudes pendientes.
SELECT
  (SELECT count(*) FROM public.usuarios) AS usuarios_totales,
  (SELECT count(*) FROM public.usuarios WHERE activo IS TRUE) AS usuarios_activos,
  (SELECT count(*) FROM public.usuarios WHERE activo IS FALSE) AS usuarios_inactivos,
  (SELECT count(*) FROM public.roles) AS roles,
  (SELECT count(*) FROM public.sucursales WHERE activa IS TRUE) AS sucursales_activas,
  (
    SELECT count(*)
    FROM public.solicitudes_acceso
    WHERE estado = 'Pendiente'
  ) AS solicitudes_pendientes;

-- 7. Usuarios sin rol ni permiso directo, y usuarios sin sucursal asignada.
-- Son avisos para revisar, no necesariamente errores: el acceso a todas las
-- sucursales y los permisos directos pueden ser configuraciones intencionales.
SELECT
  u.id,
  u.usuario,
  u.activo,
  u.acceso_todas_sucursales,
  EXISTS (
    SELECT 1
    FROM public.usuario_roles ur
    WHERE ur.usuario_id = u.id
  ) AS tiene_rol,
  COALESCE(u.permisos, '{}'::jsonb) <> '{}'::jsonb AS tiene_permisos_directos,
  EXISTS (
    SELECT 1
    FROM public.usuario_sucursales us
    WHERE us.usuario_id = u.id
  ) AS tiene_sucursal_asignada
FROM public.usuarios u
WHERE u.activo IS TRUE
  AND (
    (
      NOT EXISTS (
        SELECT 1 FROM public.usuario_roles ur WHERE ur.usuario_id = u.id
      )
      AND COALESCE(u.permisos, '{}'::jsonb) = '{}'::jsonb
    )
    OR (
      u.acceso_todas_sucursales IS FALSE
      AND NOT EXISTS (
        SELECT 1 FROM public.usuario_sucursales us WHERE us.usuario_id = u.id
      )
    )
  )
ORDER BY u.usuario;

-- 8. Confirma la funcion SQL usada para aprobar solicitudes de acceso.
SELECT
  to_regprocedure('public.aprobar_solicitud_acceso(uuid,uuid,uuid[],uuid)') IS NOT NULL
    AS funcion_aprobar_solicitud_acceso_existe;
