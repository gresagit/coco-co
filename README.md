# Coco & Co. — Sistema de Inventarios en la Nube

Sistema a la medida construido con **Next.js 14 + PostgreSQL (Supabase) + Vercel**,
según la Hoja de Requerimientos v2.0 (agosto 2026).

## Módulos incluidos

1. Catálogo de Producto Terminado (con costeo y precio sugerido automáticos)
2. Catálogo de Insumos (materia prima / empaque / etiquetas / producto intermedio) + FEFO
3. Fórmulas (BOM), con soporte de **recetas anidadas**
4. Producción: órdenes de producción + reportes de avance incrementales (con merma),
   generación automática de lotes y piezas (trazabilidad pieza → lote → orden → SKU)
5. **Generador de Códigos de Barra** (independiente de producción): elige producto, si va ligado a
   un lote existente / uno nuevo / sin lote (impresión anticipada), cuántos códigos quieres, y
   descarga el PDF con todos los códigos **Code128** listos para tu imprenta, con % de repuesto
   configurable. También sigue disponible el PDF de etiquetas por lote desde Producción.
6. Movimientos de inventario (entradas/salidas/ajustes) y **transferencias entre sucursales**
7. Proveedores + **Órdenes de Compra formales**, exportables en PDF, con recepción total/parcial
8. Multi-sucursal: inventario independiente, catálogo compartido
9. Alertas: semáforo en sistema (ya activo) + reglas configurables para correo/WhatsApp
10. Usuarios, Roles y Permisos, con perfiles personalizados/temporales y alcance por sucursal

Login por defecto: **Usuario: `Admin`  /  Contraseña: `cisco`**
(cámbiala en cuanto entres, desde el módulo "Usuarios y Roles").

---

## 1. Configurar Supabase

1. Crea un proyecto nuevo en [supabase.com](https://supabase.com).
2. Ve a **SQL Editor → New query**, pega el contenido de `supabase/schema.sql` y ejecútalo.
   Esto crea todas las tablas (incluida `sucursales`), el usuario `Admin` con contraseña `cisco`,
   los 5 roles base y una sucursal "Matriz" de ejemplo. **Este paso es obligatorio y va primero** —
   todas las migraciones de abajo dependen de tablas que crea este script (si las corres antes,
   verás errores como `relation "sucursales" does not exist`).
3. Corre, en este orden, cada uno de los siguientes archivos (pega el contenido completo de cada
   uno en una query nueva y ejecútalo; ninguno borra datos existentes):
   - `supabase/migration_002_generador_codigos_barra.sql` — Generador de Códigos de Barra
   - `supabase/migration_003_metas_produccion.sql` — Metas de producción
   - `supabase/migration_004_escaneo.sql` — Escaneo de inventario/insumos
   - `supabase/migration_005_insumos_marca.sql` — Marca en insumos
   - `supabase/migration_006_bom_julio2026.sql` — Ajustes de fórmulas (BOM)
   - `supabase/migration_007_ventas.sql` — Sección Ventas (stock Shopify + punto de venta)
   - `supabase/migration_008_quitar_repuesto.sql` — Quita el % de repuesto del generador de códigos
   - `supabase/migration_009_pedidos_impresion.sql` — Pedidos de impresión con varios productos a la vez
4. (Opcional, cuando tengas el Excel) usa `supabase/seed_migracion_ejemplo.sql` como plantilla
   para generar los INSERT reales de tus 23 materias primas, 24 empaques, 11 etiquetas,
   ~40 SKUs y 21 recetas.
5. En **Project Settings → API** copia:
   - `Project URL` → variable `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public key` → variable `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role key` → variable `SUPABASE_SERVICE_ROLE_KEY` (¡mantenla secreta, nunca la
     expongas en el frontend! Aquí solo se usa en el servidor.)

## 2. Subir el proyecto a GitHub

```bash
cd cococo-inventory
git init
git add .
git commit -m "Sistema de inventarios Coco & Co. v2.0"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/cococo-inventarios.git
git push -u origin main
```

## 3. Desplegar en Vercel

1. Entra a [vercel.com/new](https://vercel.com/new) e importa el repositorio de GitHub.
2. Framework Preset: **Next.js** (se detecta automático).
3. En **Environment Variables** agrega las mismas 4 variables del `.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SESSION_SECRET` (genera un valor aleatorio: `openssl rand -base64 32`)
4. Click **Deploy**. En unos minutos tendrás tu URL pública (ej. `cococo-inventarios.vercel.app`).
5. Entra con `Admin` / `cisco` y cambia la contraseña desde el módulo de Usuarios.

## 4. Desarrollo local (opcional)

```bash
npm install
cp .env.example .env.local   # y llena tus valores reales de Supabase
npm run dev
```

Abre `http://localhost:3000`.

---

## Notas técnicas importantes

- **Autenticación**: el login v1 valida contra la tabla `usuarios` (bcrypt) desde el
  servidor y usa una cookie de sesión firmada con `SESSION_SECRET`. Es una solución
  simple y funcional; si más adelante quieren usar Supabase Auth nativo (magic links,
  RLS por usuario, etc.), el esquema ya está preparado para migrar sin rehacer las tablas.
- **RLS (Row Level Security)**: está deshabilitado en v1 porque todas las consultas pasan
  por el backend con la `service_role key`, que ignora RLS. El control de acceso por
  sucursal (§8.4/§10.3 de los requerimientos) se aplica hoy a nivel de aplicación
  (tabla `usuario_sucursales`); si quieren blindarlo también a nivel de base de datos,
  se puede activar RLS y escribir policies basadas en esa misma tabla.
- **Notificaciones (correo / WhatsApp)**: el módulo de Alertas ya calcula el semáforo en
  tiempo real y permite configurar reglas (quién recibe qué, por qué canal, con qué
  frecuencia). El envío real de correo (Resend/SendGrid) y WhatsApp (Twilio o Meta Cloud
  API) requiere:
  1. Contratar/crear la cuenta del proveedor.
  2. Agregar sus API keys como variables de entorno (`RESEND_API_KEY`, etc., ver `.env.example`).
  3. Conectar un *cron job* (Vercel Cron es la opción más simple) que revise el semáforo
     periódicamente y dispare los envíos según las reglas de `alertas_config`.
  Esto se dejó como siguiente paso porque WhatsApp Business requiere aprobar plantillas
  con Meta primero (trámite de varios días, como se anota en los requerimientos §9.3).
- **Código de barras**: se usa `bwip-js` (Code128) renderizado directamente en el PDF de
  etiquetas (`pdf-lib`), sin depender de servicios externos.
- **Costeo automático**: `src/lib/costeo.ts` calcula el costo sumando el BOM y soporta
  recursión para recetas anidadas (ej. hojuelas de jabón usadas dentro de otro producto).
- **Escaneo físico** (lector vs. cámara): pendiente de decidir según los requerimientos;
  no bloquea el uso del sistema, ya que las salidas por venta pueden registrarse también
  buscando el folio manualmente mientras se define el dispositivo.

## Pendientes abiertos (heredados de la hoja de requerimientos, sección 12)

- Devoluciones: política de reingreso a inventario y asignación de lote.
- Facturación/CFDI: decidir si se integra timbrado o se queda fuera del alcance.
- Medidas exactas de etiqueta según la imprenta elegida (hoy el PDF usa una cuadrícula
  de 3×8 etiquetas tamaño carta, fácil de ajustar en `src/app/api/etiquetas/[loteId]/pdf/route.ts`).
- % de excedente de repuesto (hoy configurado en 5% en el mismo archivo).
- Dispositivo de escaneo definitivo.
- Criterio por default de "proveedor sugerido" (hoy el sistema deja la selección 100% al
  usuario en Compras; se puede automatizar cuando se defina el criterio).

## Estructura del proyecto

```
cococo-inventory/
├── supabase/
│   ├── schema.sql                  ← ejecutar primero en Supabase
│   └── seed_migracion_ejemplo.sql  ← plantilla para cargar el Excel
├── src/
│   ├── app/
│   │   ├── login/                  ← pantalla de acceso
│   │   ├── dashboard/              ← los 10 módulos, cada uno en su carpeta
│   │   └── api/                    ← login/logout + generación de PDFs
│   ├── components/                 ← Sidebar, etc.
│   └── lib/                        ← auth, supabase, costeo, producción, folios, barcode
├── .env.example
└── package.json
```
