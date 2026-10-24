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
   - `supabase/migration_010_reparar_folio_contadores.sql` — Repara productos que les falte el contador de
     folio para generar códigos de barra (por ejemplo, si algún producto se dio de alta fuera de la app)
   - `supabase/migration_011_aprobaciones.sql` — Visto bueno del Administrador para órdenes de producción
     y órdenes de compra
   - `supabase/migration_012_ventas_carrito.sql` — Permite registrar varios productos en una misma venta
     (carrito) desde el punto de venta
   - `supabase/migration_013_costo_por_unidad.sql` — Guarda el costo total pagado y el costo por unidad
     calculado (kg, L, pieza, etc.) en cada entrada de insumo
   - `supabase/migration_014_folios_ventas.sql` — Genera folios automáticos por sucursal para tickets del punto de venta
  - `supabase/migration_015_produccion_etapas.sql` — Agrega fecha estimada y distingue productos intermedios de productos listos para venta
  - `supabase/migration_016_permisos_usuarios.sql` — Permite seleccionar los apartados visibles para cada usuario
  - `supabase/migration_017_canales_venta.sql` — Prepara configuraciones y mapeos de productos para Mercado Libre y Amazon
  - `supabase/migration_030_solicitudes_acceso.sql` — Solicitudes públicas de acceso con aprobación administrativa
  - `supabase/migration_031_escaneo_atomico.sql` — Confirma escaneos de producto terminado de forma transaccional
  - `supabase/migration_032_pedidos_tienda_y_envios.sql` — Pedidos online, reservas, ventas POS atómicas, producción faltante y envíos
  - `supabase/migration_033_envios_por_escaneo.sql` — Salidas por escaneo, estado Enviado y enlace de cada pieza a un pedido online
  Ejecuta también las migraciones existentes `018` a `029` en orden numérico antes de `030`. Si tu base ya está actualizada hasta `029`, basta con aplicar `030`, `031`, `032` y `033`.
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

## Pedidos online y envíos desde GoDaddy

La tienda debe enviar un webhook `POST` a `/api/webhooks/godaddy` cuando se cree el pedido y cuando cambie su pago. El CRM conserva el primer pedido por `orderId`; si al inicio estaba pendiente, un evento posterior con pago confirmado lo pasa a pagado y reserva el inventario libre. Para despachar, se selecciona el pedido en **Catálogo → Enviados** y se escanea cada etiqueta: la pieza se descuenta del stock en el acto y el pedido queda Enviado al completar todas sus unidades. Las ventas físicas se escanean con la opción sin pedido; no se debe volver a descontar en POS la misma pieza.

Configura en el entorno del servidor (local y Vercel), nunca en el navegador:

- `GODADDY_WEBHOOK_SECRET`: secreto compartido entre la tienda y el CRM.
- `GODADDY_DEFAULT_SUCURSAL_ID`: UUID de la sucursal cuyo inventario atiende los pedidos de la fábrica. Debe ser una sucursal activa; no se debe asumir que “Matriz” es la fábrica.

El webhook envía `x-godaddy-timestamp` (Unix en segundos) y `x-godaddy-signature` (HMAC-SHA256 hexadecimal del texto `timestamp.cuerpo-JSON-exacto`, usando el secreto compartido). El timestamp debe tener menos de cinco minutos. Ejemplo del cuerpo:

```json
{
  "orderId": "WEB-1042",
  "paymentStatus": "paid",
  "createdAt": "2026-06-15T18:42:00Z",
  "customer": { "name": "Nombre", "email": "cliente@example.com", "phone": "5551234567" },
  "shippingAddress": {
    "name": "Nombre", "phone": "5551234567", "address1": "Calle y número",
    "address2": "", "city": "Ciudad", "state": "Estado", "postalCode": "00000", "country": "MX"
  },
  "items": [{ "sku": "JRN-0001", "quantity": 2, "unitPrice": 120 }]
}
```

`paymentStatus` debe usar `paid` al confirmarse el cobro; cualquier estado distinto queda pendiente de pago. Cada SKU debe coincidir con el catálogo del CRM y las cantidades deben ser enteras para que el despacho por pieza escaneada pueda completar el pedido. La tienda debe firmar exactamente los bytes enviados; el CRM rechaza firmas inválidas, solicitudes vencidas y productos inexistentes. Una respuesta `200` confirma que se recibió o reconoció un evento duplicado. No se activa la conexión hasta ejecutar las migraciones 032 y 033 y configurar ambos valores de entorno.

Ejemplo de envío desde el servidor Node.js de la tienda:

```js
import { createHmac } from "node:crypto";

const body = JSON.stringify(orderPayload);
const timestamp = Math.floor(Date.now() / 1000).toString();
const signature = createHmac("sha256", process.env.CRM_WEBHOOK_SECRET)
  .update(`${timestamp}.${body}`)
  .digest("hex");

await fetch(`${process.env.CRM_URL}/api/webhooks/godaddy`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-godaddy-timestamp": timestamp,
    "x-godaddy-signature": signature,
  },
  body,
});
```

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
