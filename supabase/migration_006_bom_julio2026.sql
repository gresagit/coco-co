-- ============================================================================
-- MIGRACIÓN 006 — Fórmulas BOM extraídas de 'Producciones_mes_Julio_2026.xlsx'
-- ============================================================================
-- Generado automáticamente a partir de la hoja 'POR PRODUCT' del Excel.
-- Corre esto DESPUÉS de migration_005_insumos_marca.sql.
--
-- IMPORTANTE — revisa antes de correr:
-- 1) Esta migración solo agrega insumos y fórmulas (BOM). NO crea productos
--    terminados nuevos (les faltan datos que el Excel no trae: categoría,
--    presentación, margen). Antes de correr esto, entra a Productos y confirma
--    que estos 31 productos ya existen, EXACTAMENTE con este nombre:
--      · ACERO INOXDABLE 600 g
--      · Barra Grande para Hojuela (15 kg)
--      · Barra Jabón Hojuela Piel Sensible (15kg)
--      · Barra para pastillas
--      · Jabon para Ropa 250 g
--      · Jabon para Ropa Normal 1 kg
--      · Jabón Ropa Intima
--      · Jabón espuma para manos 50 ml
--      · Jabón para Perros Lavanda
--      · Jabón para Perros Limón
--      · Jabón para Perros sin AE
--      · Jabón para Piel Sensible 1kg
--      · Jabón para Ropa de Bebé 250g
--      · Jabón para Trastes Hojuela 500 g
--      · KIT de Viaje
--      · Limpiador Baños Plastico
--      · Limpiador Baños Vidrio
--      · Limpiador Cocina Plastico
--      · Limpiador Cocina Vidrio
--      · Limpiador Multisuperficies Plástico
--      · Limpiador Multisuperficies Vidrio
--      · Limpiador Multisuperficies bolsillo 60ml
--      · Limpiador Olores y Orines
--      · Limpiador citico para pisos 1 L
--      · Quitamanchas 1 kg
--      · Quitamanchas 250g
--      · RECARGA ACERO INOXDABLE 500 g
--      · Recarga Limpiador citico para pisos
--      · Recarga de limpiadores
--      · Repelente para pulgas y Garrapatas
--      · Sales para Lavavajilla
--    Si el nombre no coincide letra por letra, esa fórmula no se va a poder ligar.
--
-- 2) De los 228 renglones de fórmula que se encontraron en el Excel, sólo se
--    pudieron calcular 121 con confianza (el producto sí se produjo en julio,
--    así que se pudo sacar la cantidad por unidad). Los otros
--    107 son de productos que este mes tuvieron 0 piezas planeadas —
--    no se puede calcular 'cantidad por unidad' con una división entre cero,
--    así que NO se incluyen aquí. Quedan listados al final del archivo
--    'bom_borrador.csv' para que captures esos manualmente cuando tengas el dato.
-- ============================================================================

-- 1) Inserta los insumos que aparecen en las fórmulas y todavía no existen
--    (se compara por nombre, sin importar mayúsculas).
with nuevos as (
  select * from (values
    ('AE de citricos', 'Materia Prima', 'kg'),
    ('AE de lavanda', 'Materia Prima', 'kg'),
    ('AE de limón', 'Materia Prima', 'kg'),
    ('Aceite de coco', 'Materia Prima', 'kg'),
    ('Aceite de coco (orgánico)', 'Materia Prima', 'kg'),
    ('Aceite de coco orgánico', 'Materia Prima', 'kg'),
    ('Aceite de girasol', 'Materia Prima', 'kg'),
    ('Aceite de girasol (HO o convencional)', 'Materia Prima', 'kg'),
    ('Aceite de girasol alto oleico', 'Materia Prima', 'kg'),
    ('Aceite esencial cedro', 'Materia Prima', 'L'),
    ('Aceite esencial de limón', 'Materia Prima', 'kg'),
    ('Aceite esencial de naranja', 'Materia Prima', 'kg'),
    ('Aceite esencial naranja', 'Materia Prima', 'L'),
    ('Agua', 'Materia Prima', 'kg'),
    ('Agua Destilada', 'Materia Prima', 'kg'),
    ('Aloe Vera', 'Materia Prima', 'kg'),
    ('Banda retractil 145x28mm (600g)', 'Empaque', 'pz'),
    ('Banda retractil 55x28mm (AE)', 'Empaque', 'pz'),
    ('Bicarbonato', 'Materia Prima', 'kg'),
    ('Bicarbonato de sodio', 'Materia Prima', 'kg'),
    ('Bolsa Stan Up 500 g', 'Empaque', 'pz'),
    ('Bolsa StanUp 1 kg', 'Empaque', 'pz'),
    ('Bolsa Stand Up 1 kg', 'Empaque', 'pz'),
    ('Botella 500ml', 'Empaque', 'pz'),
    ('Botella 500ml Plastico', 'Empaque', 'pz'),
    ('Botella 500ml plastico', 'Empaque', 'pz'),
    ('Botella 500ml plastico boston', 'Empaque', 'pz'),
    ('Botella 500ml vidrio', 'Empaque', 'pz'),
    ('Botella 60m con spray', 'Empaque', 'pz'),
    ('Botella de vidrio 1L boston', 'Empaque', 'pz'),
    ('Botella espumera 50m', 'Empaque', 'pz'),
    ('Botella plastico 500ml', 'Empaque', 'pz'),
    ('Botella vidrio 500ml', 'Empaque', 'pz'),
    ('Botellas de aceite 20ml', 'Empaque', 'pz'),
    ('Botellas de manos 50ml', 'Empaque', 'pz'),
    ('Botellas multisuperficie 60ml', 'Empaque', 'pz'),
    ('Caléndula', 'Materia Prima', 'kg'),
    ('Carbonato de sodio', 'Materia Prima', 'kg'),
    ('Cierre termico', 'Empaque', 'pz'),
    ('Citrato de sodio', 'Materia Prima', 'kg'),
    ('Cordón', 'Empaque', 'm'),
    ('Cuchara dosificadora (15ml)', 'Empaque', 'pz'),
    ('Cuchara dosificadora (25ml)', 'Empaque', 'pz'),
    ('Cuenta gotas de aceites 30, 20 y 15ml', 'Empaque', 'pz'),
    ('ETQ 1 Recarga sobre baños', 'Empaque', 'pz'),
    ('ETQ 1 Recarga sobre cocina', 'Empaque', 'pz'),
    ('ETQ 1 Recarga sobre multisuperficie', 'Empaque', 'pz'),
    ('ETQ 6 Recarga limpiadores 40g', 'Empaque', 'pz'),
    ('ETQ Jabón espuma para manos', 'Empaque', 'pz'),
    ('ETQ Jabón para Ropa 250 g', 'Empaque', 'pz'),
    ('ETQ Jabón perro (amarillo)', 'Empaque', 'pz'),
    ('ETQ Jabón perro (morado)', 'Empaque', 'pz'),
    ('ETQ Jabón perro (rojo)', 'Empaque', 'pz'),
    ('ETQ Jabón ropa bebé 250g', 'Empaque', 'pz'),
    ('ETQ Lavavajillas', 'Empaque', 'pz'),
    ('ETQ Limpiador Acero INOX juego 600 g', 'Empaque', 'pz'),
    ('ETQ Limpiador baños 500ml', 'Empaque', 'pz'),
    ('ETQ Limpiador citrico para pisos', 'Empaque', 'pz'),
    ('ETQ Limpiador cocina 500ml', 'Empaque', 'pz'),
    ('ETQ Limpiador manchas 500ml', 'Empaque', 'pz'),
    ('ETQ Limpiador multisuperficie 500ml', 'Empaque', 'pz'),
    ('ETQ Limpiador multisuperficies 60ml', 'Empaque', 'pz'),
    ('ETQ Limpiador para pisos 20ml', 'Empaque', 'pz'),
    ('ETQ Quitamanchas 250g', 'Empaque', 'pz'),
    ('ETQ Recarga Acero INOX juego 500 g', 'Empaque', 'pz'),
    ('ETQ Recarga de pisos 60g', 'Empaque', 'pz'),
    ('ETQ Recarga para 3 jabón manos', 'Empaque', 'pz'),
    ('ETQ Recarga para 3 multisuperficie', 'Empaque', 'pz'),
    ('ETQ. JABÓN PARA ROPA ÍNTIMA', 'Empaque', 'pz'),
    ('Eiqueta recarga manos', 'Empaque', 'pz'),
    ('Etiqueta jabon manos', 'Empaque', 'pz'),
    ('Etiqueta multisuso bolsillo', 'Empaque', 'pz'),
    ('Etiqueta orines', 'Empaque', 'pz'),
    ('Etiqueta repelente', 'Empaque', 'pz'),
    ('Frasco de 15 ml', 'Empaque', 'pz'),
    ('Frasco de 30ml', 'Empaque', 'pz'),
    ('Glicerina', 'Materia Prima', 'kg'),
    ('Gluconato de sodio', 'Materia Prima', 'kg'),
    ('Hidróxido de potasio', 'Materia Prima', 'kg'),
    ('Hilo para sobres', 'Empaque', 'm'),
    ('Jabón de coco (hojuelas)', 'Materia Prima', 'kg'),
    ('Jabón en hojuelas (oliva, coco, aloe, caléndula)', 'Materia Prima', 'kg'),
    ('Jabón en hojuelas normal', 'Materia Prima', 'kg'),
    ('Jabón en polvo (coco)', 'Materia Prima', 'kg'),
    ('Lata de 600g', 'Empaque', 'pz'),
    ('Lavanda', 'Materia Prima', 'kg'),
    ('Mini etiqueta orines', 'Empaque', 'pz'),
    ('Mini etiqueta repelente', 'Empaque', 'pz'),
    ('Papel Kraft corrugado', 'Empaque', 'm'),
    ('Pastilla 1 g', 'Materia Prima', 'pz'),
    ('Pastillas Jabon 5g', 'Materia Prima', 'pz'),
    ('Pastillas Jabón 0.5g', 'Materia Prima', 'pz'),
    ('Pastillas Jabón 1g', 'Materia Prima', 'pz'),
    ('Pastillas de 5g', 'Materia Prima', 'pz'),
    ('Pasto de Limón', 'Materia Prima', 'kg'),
    ('Percarbonato de sodio', 'Materia Prima', 'kg'),
    ('Sal de mar', 'Materia Prima', 'kg'),
    ('Sobre Kraft 250 g', 'Empaque', 'pz'),
    ('Sobre de recargas paper craft', 'Empaque', 'pz'),
    ('Sobre kraft de recargas', 'Empaque', 'pz'),
    ('Sobre kraft recarga', 'Empaque', 'pz'),
    ('Sobres Kraft 250g', 'Empaque', 'pz'),
    ('Sobres para lavavajillas', 'Empaque', 'pz'),
    ('Sobres recarga 6 pz', 'Empaque', 'pz'),
    ('Sosa caustica escamas', 'Materia Prima', 'kg'),
    ('Sosa cáustica', 'Materia Prima', 'kg'),
    ('Sábila', 'Materia Prima', 'kg'),
    ('Tapa atomizador', 'Empaque', 'pz'),
    ('Tapa de frasco 15 ml', 'Empaque', 'pz'),
    ('Tapa de frasco 30 ml', 'Empaque', 'pz'),
    ('Tapa de frasco 600g', 'Empaque', 'pz'),
    ('Tapa metálica', 'Empaque', 'pz'),
    ('Tapas atomizador 60ml', 'Empaque', 'pz'),
    ('Tapas de atomizador 500ml', 'Empaque', 'pz'),
    ('Tapas para aceite de 30, 20 y 15ml', 'Empaque', 'pz'),
    ('Ylang-ylang', 'Materia Prima', 'kg'),
    ('cuenta gotas', 'Empaque', 'pz'),
    ('etiqueta recarga manos', 'Empaque', 'pz'),
    ('percarbonato de sodio', 'Materia Prima', 'kg'),
    ('Ácido cítrico', 'Materia Prima', 'kg')
  ) as t(nombre, tipo, unidad_medida)
  where not exists (select 1 from insumos i where lower(i.nombre) = lower(t.nombre))
),
siguiente_mp as (
  select coalesce(max(nullif(regexp_replace(codigo_interno, '\D', '', 'g'), '')::int), 0) as n
  from insumos where codigo_interno like 'MP-%'
),
siguiente_emp as (
  select coalesce(max(nullif(regexp_replace(codigo_interno, '\D', '', 'g'), '')::int), 0) as n
  from insumos where codigo_interno like 'EMP-%'
),
numerados as (
  select *, row_number() over (partition by tipo order by nombre) as rn from nuevos
)
insert into insumos (codigo_interno, nombre, tipo, unidad_medida, controla_caducidad, costo_unitario_actual)
select
  case tipo
    when 'Materia Prima' then 'MP-' || lpad(((select n from siguiente_mp) + rn)::text, 4, '0')
    else 'EMP-' || lpad(((select n from siguiente_emp) + rn)::text, 4, '0')
  end,
  nombre, tipo, unidad_medida, false, 0
from numerados;

-- 2) Asegura que todos estos insumos tengan su fila de stock (en 0) en cada
--    sucursal activa — igual que hace la app cuando das de alta un insumo manual.
insert into insumo_stock (insumo_id, sucursal_id, stock_minimo, cantidad_disponible)
select i.id, s.id, 0, 0
from insumos i
cross join sucursales s
where s.activa
  and lower(i.nombre) in (
    'ae de citricos',
    'ae de lavanda',
    'ae de limón',
    'aceite de coco',
    'aceite de coco (orgánico)',
    'aceite de coco orgánico',
    'aceite de girasol',
    'aceite de girasol (ho o convencional)',
    'aceite de girasol alto oleico',
    'aceite esencial cedro',
    'aceite esencial de limón',
    'aceite esencial de naranja',
    'aceite esencial naranja',
    'agua',
    'agua destilada',
    'aloe vera',
    'banda retractil 145x28mm (600g)',
    'banda retractil 55x28mm (ae)',
    'bicarbonato',
    'bicarbonato de sodio',
    'bolsa stan up 500 g',
    'bolsa stanup 1 kg',
    'bolsa stand up 1 kg',
    'botella 500ml',
    'botella 500ml plastico',
    'botella 500ml plastico',
    'botella 500ml plastico boston',
    'botella 500ml vidrio',
    'botella 60m con spray',
    'botella de vidrio 1l boston',
    'botella espumera 50m',
    'botella plastico 500ml',
    'botella vidrio 500ml',
    'botellas de aceite 20ml',
    'botellas de manos 50ml',
    'botellas multisuperficie 60ml',
    'caléndula',
    'carbonato de sodio',
    'cierre termico',
    'citrato de sodio',
    'cordón',
    'cuchara dosificadora (15ml)',
    'cuchara dosificadora (25ml)',
    'cuenta gotas de aceites 30, 20 y 15ml',
    'etq 1 recarga sobre baños',
    'etq 1 recarga sobre cocina',
    'etq 1 recarga sobre multisuperficie',
    'etq 6 recarga limpiadores 40g',
    'etq jabón espuma para manos',
    'etq jabón para ropa 250 g',
    'etq jabón perro (amarillo)',
    'etq jabón perro (morado)',
    'etq jabón perro (rojo)',
    'etq jabón ropa bebé 250g',
    'etq lavavajillas',
    'etq limpiador acero inox juego 600 g',
    'etq limpiador baños 500ml',
    'etq limpiador citrico para pisos',
    'etq limpiador cocina 500ml',
    'etq limpiador manchas 500ml',
    'etq limpiador multisuperficie 500ml',
    'etq limpiador multisuperficies 60ml',
    'etq limpiador para pisos 20ml',
    'etq quitamanchas 250g',
    'etq recarga acero inox juego 500 g',
    'etq recarga de pisos 60g',
    'etq recarga para 3 jabón manos',
    'etq recarga para 3 multisuperficie',
    'etq. jabón para ropa íntima',
    'eiqueta recarga manos',
    'etiqueta jabon manos',
    'etiqueta multisuso bolsillo',
    'etiqueta orines',
    'etiqueta repelente',
    'frasco de 15 ml',
    'frasco de 30ml',
    'glicerina',
    'gluconato de sodio',
    'hidróxido de potasio',
    'hilo para sobres',
    'jabón de coco (hojuelas)',
    'jabón en hojuelas (oliva, coco, aloe, caléndula)',
    'jabón en hojuelas normal',
    'jabón en polvo (coco)',
    'lata de 600g',
    'lavanda',
    'mini etiqueta orines',
    'mini etiqueta repelente',
    'papel kraft corrugado',
    'pastilla 1 g',
    'pastillas jabon 5g',
    'pastillas jabón 0.5g',
    'pastillas jabón 1g',
    'pastillas de 5g',
    'pasto de limón',
    'percarbonato de sodio',
    'sal de mar',
    'sobre kraft 250 g',
    'sobre de recargas paper craft',
    'sobre kraft de recargas',
    'sobre kraft recarga',
    'sobres kraft 250g',
    'sobres para lavavajillas',
    'sobres recarga 6 pz',
    'sosa caustica escamas',
    'sosa cáustica',
    'sábila',
    'tapa atomizador',
    'tapa de frasco 15 ml',
    'tapa de frasco 30 ml',
    'tapa de frasco 600g',
    'tapa metálica',
    'tapas atomizador 60ml',
    'tapas de atomizador 500ml',
    'tapas para aceite de 30, 20 y 15ml',
    'ylang-ylang',
    'cuenta gotas',
    'etiqueta recarga manos',
    'percarbonato de sodio',
    'ácido cítrico'
  )
  and not exists (
    select 1 from insumo_stock st where st.insumo_id = i.id and st.sucursal_id = s.id
  );

-- 3) Inserta las fórmulas (BOM) — sólo las que se pudieron calcular con confianza.
--    Se liga por nombre exacto de producto e insumo; si el producto no existe
--    todavía en tu catálogo, ese renglón simplemente no inserta nada (no truena).
insert into bom (producto_id, insumo_id, cantidad_por_unidad, unidad)
select p.id, i.id, v.cantidad_por_unidad, v.unidad
from (values
  ('Jabon para Ropa Normal 1 kg', 'Carbonato de sodio', 0.395467, 'kg'),
  ('Jabon para Ropa Normal 1 kg', 'Bolsa Stand Up 1 kg', 1.0, 'pz'),
  ('Jabon para Ropa Normal 1 kg', 'Gluconato de sodio', 0.006667, 'kg'),
  ('Jabon para Ropa Normal 1 kg', 'Cuchara dosificadora (25ml)', 1.0, 'pz'),
  ('Jabon para Ropa Normal 1 kg', 'Percarbonato de sodio', 0.1356, 'kg'),
  ('Jabon para Ropa Normal 1 kg', 'Citrato de sodio', 0.1695, 'kg'),
  ('Jabon para Ropa Normal 1 kg', 'Bicarbonato de sodio', 0.1356, 'kg'),
  ('Jabon para Ropa Normal 1 kg', 'Jabón en hojuelas normal', 0.147167, 'kg'),
  ('Jabon para Ropa Normal 1 kg', 'Ácido cítrico', 0.01, 'kg'),
  ('Quitamanchas 1 kg', 'Percarbonato de sodio', 0.482467, 'kg'),
  ('Quitamanchas 1 kg', 'Bolsa StanUp 1 kg', 1.0, 'pz'),
  ('Quitamanchas 1 kg', 'Bicarbonato de sodio', 0.394733, 'kg'),
  ('Quitamanchas 1 kg', 'Cuchara dosificadora (15ml)', 1.0, 'pz'),
  ('Quitamanchas 1 kg', 'Citrato de sodio', 0.1228, 'kg'),
  ('Jabón para Piel Sensible 1kg', 'Carbonato de sodio', 0.316667, 'kg'),
  ('Jabón para Piel Sensible 1kg', 'Bolsa Stand Up 1 kg', 1.0, 'pz'),
  ('Jabón para Piel Sensible 1kg', 'Percarbonato de sodio', 0.19, 'kg'),
  ('Jabón para Piel Sensible 1kg', 'Cuchara dosificadora (25ml)', 1.0, 'pz'),
  ('Jabón para Piel Sensible 1kg', 'Bicarbonato de sodio', 0.183333, 'kg'),
  ('Jabón para Piel Sensible 1kg', 'Ácido cítrico', 0.006667, 'kg'),
  ('Jabón para Piel Sensible 1kg', 'Jabón en hojuelas (oliva, coco, aloe, caléndula)', 0.16, 'kg'),
  ('Jabón para Piel Sensible 1kg', 'Gluconato de sodio', 0.01, 'kg'),
  ('Jabón para Piel Sensible 1kg', 'Citrato de sodio', 0.133333, 'kg'),
  ('ACERO INOXDABLE 600 g', 'Bicarbonato', 0.48, 'kg'),
  ('ACERO INOXDABLE 600 g', 'ETQ Limpiador Acero INOX juego 600 g', 1.0, 'pz'),
  ('ACERO INOXDABLE 600 g', 'Jabón en hojuelas normal', 0.024, 'kg'),
  ('ACERO INOXDABLE 600 g', 'Lata de 600g', 1.0, 'pz'),
  ('ACERO INOXDABLE 600 g', 'Glicerina', 0.09, 'kg'),
  ('ACERO INOXDABLE 600 g', 'Tapa de frasco 600g', 1.0, 'pz'),
  ('ACERO INOXDABLE 600 g', 'Aceite esencial de naranja', 0.006, 'kg'),
  ('ACERO INOXDABLE 600 g', 'Banda retractil 145x28mm (600g)', 1.0, 'pz'),
  ('ACERO INOXDABLE 600 g', 'Papel Kraft corrugado', 0.35, 'm'),
  ('Limpiador Multisuperficies Vidrio', 'Pastillas Jabon 5g', 3.0, 'pz'),
  ('Limpiador Multisuperficies Vidrio', 'ETQ Limpiador multisuperficie 500ml', 1.0, 'pz'),
  ('Limpiador Multisuperficies Vidrio', 'Tapas de atomizador 500ml', 1.0, 'pz'),
  ('Limpiador Multisuperficies Vidrio', 'Sobre de recargas paper craft', 2.0, 'pz'),
  ('Limpiador Multisuperficies Vidrio', 'ETQ 1 Recarga sobre multisuperficie', 2.0, 'pz'),
  ('Limpiador Multisuperficies Vidrio', 'Hilo para sobres', 1.0, 'pz'),
  ('Limpiador Multisuperficies Vidrio', 'Botella vidrio 500ml', 1.0, 'pz'),
  ('Limpiador Multisuperficies Plástico', 'Pastillas Jabon 5g', 3.0, 'pz'),
  ('Limpiador Multisuperficies Plástico', 'ETQ Limpiador multisuperficie 500ml', 1.0, 'pz'),
  ('Limpiador Multisuperficies Plástico', 'Tapas de atomizador 500ml', 1.0, 'pz'),
  ('Limpiador Multisuperficies Plástico', 'Sobre de recargas paper craft', 2.0, 'pz'),
  ('Limpiador Multisuperficies Plástico', 'ETQ 1 Recarga sobre multisuperficie', 2.0, 'pz'),
  ('Limpiador Multisuperficies Plástico', 'Hilo para sobres', 0.1, 'm'),
  ('Limpiador Multisuperficies Plástico', 'Botella plastico 500ml', 1.0, 'pz'),
  ('Limpiador Baños Vidrio', 'Pastillas Jabon 5g', 6.0, 'pz'),
  ('Limpiador Baños Vidrio', 'ETQ Limpiador baños 500ml', 1.0, 'pz'),
  ('Limpiador Baños Vidrio', 'Tapas de atomizador 500ml', 1.0, 'pz'),
  ('Limpiador Baños Vidrio', 'Sobre kraft de recargas', 2.0, 'pz'),
  ('Limpiador Baños Vidrio', 'ETQ 1 Recarga sobre baños', 2.0, 'pz'),
  ('Limpiador Baños Vidrio', 'Cordón', 0.1, 'm'),
  ('Limpiador Baños Vidrio', 'Botella 500ml vidrio', 1.0, 'pz'),
  ('Limpiador Baños Plastico', 'Pastillas Jabon 5g', 6.0, 'pz'),
  ('Limpiador Baños Plastico', 'ETQ Limpiador baños 500ml', 1.0, 'pz'),
  ('Limpiador Baños Plastico', 'Tapas de atomizador 500ml', 1.0, 'pz'),
  ('Limpiador Baños Plastico', 'Sobre kraft de recargas', 2.0, 'pz'),
  ('Limpiador Baños Plastico', 'ETQ 1 Recarga sobre baños', 2.0, 'pz'),
  ('Limpiador Baños Plastico', 'Cordón', 0.1, 'm'),
  ('Limpiador Baños Plastico', 'Botella 500ml Plastico', 1.0, 'pz'),
  ('Limpiador Cocina Vidrio', 'Pastillas Jabon 5g', 6.0, 'pz'),
  ('Limpiador Cocina Vidrio', 'ETQ Limpiador manchas 500ml', 1.0, 'pz'),
  ('Limpiador Cocina Vidrio', 'Tapas de atomizador 500ml', 1.0, 'pz'),
  ('Limpiador Cocina Vidrio', 'Sobre kraft de recargas', 2.0, 'pz'),
  ('Limpiador Cocina Vidrio', 'ETQ 1 Recarga sobre cocina', 2.0, 'pz'),
  ('Limpiador Cocina Vidrio', 'Cordón', 0.1, 'm'),
  ('Limpiador Cocina Vidrio', 'Botella 500ml', 1.0, 'pz'),
  ('Limpiador Cocina Plastico', 'Pastillas Jabon 5g', 6.0, 'pz'),
  ('Limpiador Cocina Plastico', 'ETQ Limpiador cocina 500ml', 1.0, 'pz'),
  ('Limpiador Cocina Plastico', 'Tapas de atomizador 500ml', 1.0, 'pz'),
  ('Limpiador Cocina Plastico', 'Sobre kraft de recargas', 2.0, 'pz'),
  ('Limpiador Cocina Plastico', 'ETQ 1 Recarga sobre cocina', 2.0, 'pz'),
  ('Limpiador Cocina Plastico', 'Cordón', 0.1, 'm'),
  ('Limpiador Cocina Plastico', 'Botella 500ml plastico', 1.0, 'pz'),
  ('Jabón para Trastes Hojuela 500 g', 'Aceite de coco', 0.2706, 'kg'),
  ('Jabón para Trastes Hojuela 500 g', 'Bolsa Stan Up 500 g', 1.0, 'pz'),
  ('Jabón para Trastes Hojuela 500 g', 'Aceite de girasol alto oleico', 0.122167, 'kg'),
  ('Jabón para Trastes Hojuela 500 g', 'Sosa cáustica', 0.052133, 'kg'),
  ('Jabón para Trastes Hojuela 500 g', 'Agua Destilada', 0.1023, 'kg'),
  ('Jabón para Trastes Hojuela 500 g', 'Aloe Vera', 0.032833, 'kg'),
  ('Jabón para Trastes Hojuela 500 g', 'Citrato de sodio', 0.007267, 'kg'),
  ('Jabón para Trastes Hojuela 500 g', 'Gluconato de sodio', 0.001833, 'kg'),
  ('Jabón para Trastes Hojuela 500 g', 'Aceite esencial de limón', 0.010867, 'kg'),
  ('Limpiador citico para pisos 1 L', 'Pastillas de 5g', 2.0, 'pz'),
  ('Limpiador citico para pisos 1 L', 'ETQ Limpiador citrico para pisos', 1.0, 'pz'),
  ('Limpiador citico para pisos 1 L', 'AE de citricos', 0.02, 'kg'),
  ('Limpiador citico para pisos 1 L', 'Tapa metálica', 1.0, 'pz'),
  ('Limpiador citico para pisos 1 L', 'Botellas de aceite 20ml', 1.0, 'pz'),
  ('Limpiador citico para pisos 1 L', 'ETQ Limpiador para pisos 20ml', 1.0, 'pz'),
  ('Limpiador citico para pisos 1 L', 'Botella de vidrio 1L boston', 1.0, 'pz'),
  ('Limpiador citico para pisos 1 L', 'Tapas para aceite de 30, 20 y 15ml', 1.0, 'pz'),
  ('Limpiador citico para pisos 1 L', 'Cuenta gotas de aceites 30, 20 y 15ml', 1.0, 'pz'),
  ('Limpiador citico para pisos 1 L', 'Banda retractil 55x28mm (AE)', 1.0, 'pz'),
  ('Recarga Limpiador citico para pisos', 'AE de citricos', 0.02, 'kg'),
  ('Recarga Limpiador citico para pisos', 'ETQ Limpiador para pisos 20ml', 1.0, 'pz'),
  ('Recarga Limpiador citico para pisos', 'Pastillas de 5g', 2.0, 'pz'),
  ('Recarga Limpiador citico para pisos', 'Sobres recarga 6 pz', 1.0, 'pz'),
  ('Recarga Limpiador citico para pisos', 'Botellas de aceite 20ml', 1.0, 'pz'),
  ('Recarga Limpiador citico para pisos', 'ETQ Recarga de pisos 60g', 1.0, 'pz'),
  ('Recarga Limpiador citico para pisos', 'Tapas para aceite de 30, 20 y 15ml', 1.0, 'pz'),
  ('Recarga Limpiador citico para pisos', 'Cuenta gotas de aceites 30, 20 y 15ml', 1.0, 'pz'),
  ('Recarga Limpiador citico para pisos', 'Banda retractil 55x28mm (AE)', 1.0, 'pz'),
  ('Recarga de limpiadores', 'Pastillas Jabon 5g', 6.0, 'pz'),
  ('Recarga de limpiadores', 'ETQ 6 Recarga limpiadores 40g', 1.0, 'pz'),
  ('Recarga de limpiadores', 'Sobres recarga 6 pz', 1.0, 'pz'),
  ('Barra Grande para Hojuela (15 kg)', 'Aceite de coco', 13.386, 'kg'),
  ('Barra Grande para Hojuela (15 kg)', 'Agua', 2.8, 'kg'),
  ('Barra Grande para Hojuela (15 kg)', 'Sosa cáustica', 1.814, 'kg'),
  ('Barra para pastillas', 'Aceite de coco (orgánico)', 5.517, 'kg'),
  ('Barra para pastillas', 'Aceite de girasol', 2.635, 'kg'),
  ('Barra para pastillas', 'Sosa cáustica', 0.75, 'kg'),
  ('Barra para pastillas', 'Hidróxido de potasio', 0.208, 'kg'),
  ('Barra para pastillas', 'Agua', 1.7, 'kg'),
  ('Barra para pastillas', 'Gluconato de sodio', 0.07, 'kg'),
  ('Barra para pastillas', 'Citrato de sodio', 0.164, 'kg'),
  ('Barra Jabón Hojuela Piel Sensible (15kg)', 'Aceite de coco', 10.0, 'kg'),
  ('Barra Jabón Hojuela Piel Sensible (15kg)', 'Aceite de girasol', 2.825, 'kg'),
  ('Barra Jabón Hojuela Piel Sensible (15kg)', 'Caléndula', 0.2, 'kg'),
  ('Barra Jabón Hojuela Piel Sensible (15kg)', 'Sábila', 0.5, 'kg'),
  ('Barra Jabón Hojuela Piel Sensible (15kg)', 'Sosa cáustica', 1.713, 'kg'),
  ('Barra Jabón Hojuela Piel Sensible (15kg)', 'Agua', 2.762, 'kg')
) as v(producto_nombre, insumo_nombre, cantidad_por_unidad, unidad)
join productos p on lower(p.nombre) = lower(v.producto_nombre)
join insumos i on lower(i.nombre) = lower(v.insumo_nombre)
where not exists (
  select 1 from bom b where b.producto_id = p.id and b.insumo_id = i.id
);

-- 4) Diagnóstico: corre esto DESPUÉS para ver qué productos del Excel no se
--    pudieron ligar (porque el nombre no existe todavía en tu catálogo).
-- select distinct v.producto_nombre
-- from (values
--   ('ACERO INOXDABLE 600 g'),
--   ('Barra Grande para Hojuela (15 kg)'),
--   ('Barra Jabón Hojuela Piel Sensible (15kg)'),
--   ('Barra para pastillas'),
--   ('Jabon para Ropa 250 g'),
--   ('Jabon para Ropa Normal 1 kg'),
--   ('Jabón Ropa Intima'),
--   ('Jabón espuma para manos 50 ml'),
--   ('Jabón para Perros Lavanda'),
--   ('Jabón para Perros Limón'),
--   ('Jabón para Perros sin AE'),
--   ('Jabón para Piel Sensible 1kg'),
--   ('Jabón para Ropa de Bebé 250g'),
--   ('Jabón para Trastes Hojuela 500 g'),
--   ('KIT de Viaje'),
--   ('Limpiador Baños Plastico'),
--   ('Limpiador Baños Vidrio'),
--   ('Limpiador Cocina Plastico'),
--   ('Limpiador Cocina Vidrio'),
--   ('Limpiador Multisuperficies Plástico'),
--   ('Limpiador Multisuperficies Vidrio'),
--   ('Limpiador Multisuperficies bolsillo 60ml'),
--   ('Limpiador Olores y Orines'),
--   ('Limpiador citico para pisos 1 L'),
--   ('Quitamanchas 1 kg'),
--   ('Quitamanchas 250g'),
--   ('RECARGA ACERO INOXDABLE 500 g'),
--   ('Recarga Limpiador citico para pisos'),
--   ('Recarga de limpiadores'),
--   ('Repelente para pulgas y Garrapatas'),
--   ('Sales para Lavavajilla')
-- ) as v(producto_nombre)
-- where not exists (select 1 from productos p where lower(p.nombre) = lower(v.producto_nombre));