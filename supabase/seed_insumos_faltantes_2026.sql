-- COCO & CO. - Insumos faltantes detectados en ordenes de produccion
-- Ejecutar despues del schema/migraciones en Supabase SQL Editor.
--
-- Este script solo da de alta el catalogo de insumos. Los valores como
-- 0.16000 kg/pz son consumos de BOM, no costos monetarios, por lo que no se
-- escriben en costo_unitario_actual. Ese campo queda en 0 hasta capturar el
-- precio real de compra.
--
-- Es idempotente: si ya existe un insumo con el mismo nombre normalizado, lo
-- omite. Los codigos son estables para que el script pueda ejecutarse otra vez.

with nuevos(codigo_interno, nombre, tipo, unidad_medida) as (
  values
    -- Materia prima con consumo identificado
    ('MP-JABON-HOJUELAS-OLIVA-COCO', 'Jabon en hojuelas (oliva, coco, aloe, calendula)', 'Materia Prima', 'kg'),
    ('MP-GLICERINA', 'Glicerina', 'Materia Prima', 'kg'),
    ('MP-AE-NARANJA', 'Aceite esencial de naranja', 'Materia Prima', 'kg'),
    ('MP-ACEITE-COCO', 'Aceite de coco', 'Materia Prima', 'kg'),
    ('MP-ACEITE-GIRASOL-HO', 'Aceite de girasol alto oleico', 'Materia Prima', 'kg'),
    ('MP-SOSA-CAUSTICA', 'Sosa caustica', 'Materia Prima', 'kg'),
    ('MP-AGUA-DESTILADA', 'Agua Destilada', 'Materia Prima', 'kg'),
    ('MP-ALOE-VERA', 'Aloe Vera', 'Materia Prima', 'kg'),
    ('MP-AE-LIMON', 'Aceite esencial de limon', 'Materia Prima', 'kg'),
    ('MP-AE-CITRICOS', 'AE de citricos', 'Materia Prima', 'kg'),
    ('MP-PASTILLAS-JABON-5G', 'Pastillas Jabon 5g', 'Materia Prima', 'pz'),

    -- Material de empaque con consumo identificado
    ('EMP-BOLSA-STANDUP-500G', 'Bolsa StandUp 500g', 'Empaque', 'pz'),
    ('EMP-CUCHARA-15ML', 'Cuchara dosificadora (15ml)', 'Empaque', 'pz'),
    ('EMP-ETQ-ACERO-INOX-600G', 'ETQ Limpiador Acero INOX juego 600g', 'Empaque', 'pz'),
    ('EMP-LATA-600G', 'Lata de 600g', 'Empaque', 'pz'),
    ('EMP-TAPA-FRANSA-600G', 'Tapa de fransa 600g', 'Empaque', 'pz'),
    ('EMP-BANDA-RETRACTIL-145X28', 'Banda retractil 145x28mm', 'Empaque', 'pz'),
    ('EMP-PAPEL-KRAFT-CORRUGADO', 'Papel Kraft corrugado', 'Empaque', 'm'),
    ('EMP-ETQ-MULTISUPERFICIE-500ML', 'ETQ Limpiador multisuperficie 500ml', 'Empaque', 'pz'),
    ('EMP-TAPA-ATOMIZADOR-500ML', 'Tapa de atomizador 500ml', 'Empaque', 'pz'),
    ('EMP-ETQ-BANOS-500ML', 'ETQ Limpiador Baños 500ml', 'Empaque', 'pz'),
    ('EMP-SOBRE-KRAFT-RECARGAR', 'Sobre kraft de recargar', 'Empaque', 'pz'),
    ('EMP-ETQ-RECARGA-BANO', 'ETQ Recarga Baño', 'Empaque', 'pz'),
    ('EMP-ETQ-COCINA-500ML', 'ETQ Limpiador Cocina 500ml', 'Empaque', 'pz'),
    ('EMP-ETQ-RECARGA-COCINA', 'ETQ Recarga Cocina', 'Empaque', 'pz'),
    ('EMP-ETQ-CITRICO-PISOS', 'ETQ Limpiador cítrico para pisos', 'Empaque', 'pz'),
    ('EMP-TAPA-METALICA', 'Tapa metálica', 'Empaque', 'pz'),
    ('EMP-BOTELLA-ACEITE-20ML', 'Botella de aceite 20ml', 'Empaque', 'pz'),
    ('EMP-TAPA-ACEITE-30-20-15ML', 'Tapa para aceite 30/20/15ml', 'Empaque', 'pz'),
    ('EMP-CUENTAGOTAS-ACEITE-30-20-15ML', 'Cuentagotas de aceite 30/20/15ml', 'Empaque', 'pz'),
    ('EMP-BANDA-RETRACTIL-55X28-AE', 'Banda retractil 55x28mm (AE)', 'Empaque', 'pz'),
    ('EMP-ETQ-RECARGA-PISOS', 'ETQ Recarga de pisos', 'Empaque', 'pz'),

    -- Detectados con orden en cero: costo y consumo se completan despues.
    ('MP-JABON-POLVO-COCO', 'Jabon en polvo (coco)', 'Materia Prima', 'kg'),
    ('MP-SAL-MAR', 'Sal de mar', 'Materia Prima', 'kg'),
    ('MP-JABON-COCO-HOJUELAS', 'Jabon de coco (hojuelas)', 'Materia Prima', 'kg'),
    ('MP-ACEITE-GIRASOL-VARIANTE', 'Aceite de girasol (HO o convencional)', 'Materia Prima', 'kg'),
    ('MP-AGUA', 'Agua', 'Materia Prima', 'kg'),
    ('MP-LAVANDA', 'Lavanda', 'Materia Prima', 'kg'),
    ('MP-PASTO-LIMON', 'Pasto de Limón', 'Materia Prima', 'kg'),
    ('MP-YLANG-YLANG', 'Ylang-ylang', 'Materia Prima', 'kg'),
    ('MP-PASTILLAS-JABON-1G', 'Pastillas Jabon 1g', 'Materia Prima', 'pz'),
    ('MP-PASTILLAS-JABON-05G', 'Pastillas Jabon 0.5g', 'Materia Prima', 'pz'),
    ('EMP-ETQ-JABON-ROPA-250G', 'ETQ Jabon para Ropa 250g', 'Empaque', 'pz'),
    ('EMP-SOBRES-KRAFT-250G', 'Sobres Kraft 250g', 'Empaque', 'pz'),
    ('EMP-ETQ-QUITAMANCHAS-250G', 'ETQ Quitamanchas 250g', 'Empaque', 'pz'),
    ('EMP-ETQ-JABON-ROPA-BEBE-250G', 'ETQ Jabon ropa bebe 250g', 'Empaque', 'pz'),
    ('EMP-ETQ-RECARGA-ACERO-INOX-500G', 'ETQ Recarga Acero INOX juego 500g', 'Empaque', 'pz'),
    ('EMP-ETQ-LAVAVAJILLA-SALES', 'ETQ Lavavajilla / empaque de Sales para Lavavajilla', 'Empaque', 'pz'),
    ('EMP-BOTELLA-MANOS-50ML', 'Botella de manos 50ml', 'Empaque', 'pz'),
    ('EMP-ETQ-JABON-ESPUMA-MANOS', 'ETQ Jabon espuma para manos', 'Empaque', 'pz'),
    ('EMP-SOBRE-RECARGAR-PAPEL-CRAFT', 'Sobre de recargar papel craft', 'Empaque', 'pz'),
    ('EMP-ETQ-RECARGAR-3-JABON-MANOS', 'ETQ Recargar para 3 jabon manos', 'Empaque', 'pz'),
    ('EMP-BOTELLA-MULTISUPERFICIE-60ML', 'Botella multisuperficie 60ml', 'Empaque', 'pz'),
    ('EMP-TAPA-ATOMIZADOR-60ML', 'Tapa atomizador 60ml', 'Empaque', 'pz'),
    ('EMP-ETQ-RECARGA-3-MULTISUPERFICIE', 'ETQ Recarga 3 multisuperficie', 'Empaque', 'pz'),
    ('EMP-ETQ-MULTISUPERFICIE-60ML', 'ETQ Limpiador multisuperficie 60ml', 'Empaque', 'pz'),
    ('EMP-ETQ-JABON-ROPA-INTIMA', 'ETQ Jabon para ropa íntima', 'Empaque', 'pz')
)
insert into insumos (codigo_interno, nombre, tipo, unidad_medida, costo_unitario_actual, activo)
select n.codigo_interno, n.nombre, n.tipo, n.unidad_medida, 0, true
from nuevos n
where not exists (
  select 1
  from insumos i
  where lower(trim(i.nombre)) = lower(trim(n.nombre))
     or i.codigo_interno = n.codigo_interno
);

-- Revision: posibles duplicados por nombres alternativos que conviene unificar.
select i.id, i.codigo_interno, i.nombre, i.tipo, i.unidad_medida
from insumos i
where lower(i.nombre) like any (array[
  '%pastilla%5g%', '%pastilla%5 g%', '%girasol%', '%agua%',
  '%jabon%polvo%coco%', '%jabon%coco%hoj%'
])
order by i.nombre;

-- Revision: estos insumos fueron mencionados pero no se deben inventar aun
-- porque faltan cantidades legibles: Hilo para..., Botella vidrio 500ml,
-- Botella 500ml plastico, Carton y elementos del KIT de Viaje.