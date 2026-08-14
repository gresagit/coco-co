-- ============================================================================
-- MIGRACIÓN INICIAL DE DATOS — Coco & Co.
-- Plantilla para cargar el catálogo existente (Excel) a la base nueva.
-- ============================================================================
-- Instrucciones:
-- 1. Ejecuta primero supabase/schema.sql (crea las tablas y la sucursal "Matriz").
-- 2. Completa los INSERT de abajo con los datos reales del Excel:
--    - 23 materias primas, 24 empaques, 11 etiquetas -> tabla insumos
--    - ~40 SKUs de producto terminado -> tabla productos
--    - 21 recetas/BOM -> tabla bom
--    - Directorio de proveedores (hoja "Pedido") -> tabla proveedores
-- 3. Después de cargar insumos y productos, crea también sus filas de stock
--    inicial por sucursal (insumo_stock / producto_stock) con la cantidad
--    real que exista hoy en el almacén.
-- ============================================================================

-- Ejemplo — Insumos (repetir por cada una de las 23 materias primas, etc.)
-- insert into insumos (codigo_interno, nombre, tipo, unidad_medida, controla_caducidad, costo_unitario_actual)
-- values ('MP-001', 'Carbonato de sodio', 'Materia Prima', 'kg', false, 12.50);

-- Ejemplo — Stock inicial de insumo en la sucursal Matriz
-- insert into insumo_stock (insumo_id, sucursal_id, stock_minimo, cantidad_disponible)
-- select i.id, s.id, 10, 85
-- from insumos i, sucursales s
-- where i.codigo_interno = 'MP-001' and s.nombre = 'Matriz';

-- Ejemplo — Categoría y producto terminado
-- insert into categorias (nombre) values ('Jabones') on conflict (nombre) do nothing;
-- insert into productos (sku, nombre, categoria_id, presentacion, unidad_venta, porcentaje_margen_deseado)
-- select 'JAB-ROPA-1K', 'Jabón para ropa 1kg', c.id, '1 kg', 'pz', 0.30
-- from categorias c where c.nombre = 'Jabones';

-- Cada producto necesita su contador de folio:
-- insert into folio_contadores (producto_id, prefijo, ultimo_numero)
-- select id, 'JAB', 0 from productos where sku = 'JAB-ROPA-1K';

-- Y su fila de stock inicial por sucursal:
-- insert into producto_stock (producto_id, sucursal_id, stock_minimo, cantidad_disponible)
-- select p.id, s.id, 20, 0
-- from productos p, sucursales s
-- where p.sku = 'JAB-ROPA-1K' and s.nombre = 'Matriz';

-- Ejemplo — BOM (receta) de ese producto
-- insert into bom (producto_id, insumo_id, cantidad_por_unidad, unidad)
-- select p.id, i.id, 0.395, 'kg'
-- from productos p, insumos i
-- where p.sku = 'JAB-ROPA-1K' and i.codigo_interno = 'MP-001';

-- Ejemplo — Proveedor y su relación con un insumo
-- insert into proveedores (nombre, contacto, telefono, tiempo_entrega_dias, condiciones_pago)
-- values ('Química del Centro S.A.', 'Juan Pérez', '555-000-0000', 5, '30 días');
--
-- insert into insumo_proveedores (insumo_id, proveedor_id, precio_historico, es_preferido)
-- select i.id, p.id, 12.50, true
-- from insumos i, proveedores p
-- where i.codigo_interno = 'MP-001' and p.nombre = 'Química del Centro S.A.';

-- ============================================================================
-- Reemplaza los bloques comentados de arriba con los INSERT reales generados
-- a partir del Excel (uno por cada fila de materias primas, empaques,
-- etiquetas, productos, recetas y proveedores).
-- ============================================================================
