import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 256_000;
const MAX_ITEMS = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};
}

function camposPermitidos(valor: unknown, claves: string[]) {
  const fuente = objeto(valor);
  return Object.fromEntries(
    claves.flatMap((clave) =>
      typeof fuente[clave] === "string" && fuente[clave].trim()
        ? [[clave, fuente[clave].trim().slice(0, 500)]]
        : []
    )
  );
}

function verificarFirma(timestamp: string, firma: string, body: string, secreto: string) {
  if (!/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(firma)) return false;
  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) return false;
  const esperada = createHmac("sha256", secreto).update(`${timestamp}.${body}`).digest();
  const recibida = Buffer.from(firma, "hex");
  return recibida.length === esperada.length && timingSafeEqual(recibida, esperada);
}

async function leerBodyLimitado(req: NextRequest): Promise<string | null> {
  const reader = req.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function POST(req: NextRequest) {
  const secreto = process.env.GODADDY_WEBHOOK_SECRET;
  const sucursalId = process.env.GODADDY_DEFAULT_SUCURSAL_ID;
  if (!secreto || !sucursalId || !UUID_PATTERN.test(sucursalId)) {
    console.error("[webhook godaddy] faltan GODADDY_WEBHOOK_SECRET o GODADDY_DEFAULT_SUCURSAL_ID válido");
    return NextResponse.json({ ok: false, mensaje: "Integración de pedidos no configurada." }, { status: 503 });
  }

  const body = await leerBodyLimitado(req);
  if (body === null) {
    return NextResponse.json({ ok: false, mensaje: "El pedido excede el tamaño permitido." }, { status: 413 });
  }
  const timestamp = req.headers.get("x-godaddy-timestamp") || "";
  const firma = req.headers.get("x-godaddy-signature") || "";
  if (!verificarFirma(timestamp, firma, body, secreto)) {
    return NextResponse.json({ ok: false, mensaje: "Firma del webhook inválida o vencida." }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = objeto(JSON.parse(body));
  } catch {
    return NextResponse.json({ ok: false, mensaje: "El webhook no contiene JSON válido." }, { status: 400 });
  }

  const orderId = typeof payload.orderId === "string" ? payload.orderId.trim() : "";
  const paymentStatus = typeof payload.paymentStatus === "string" ? payload.paymentStatus.trim() : "";
  const rawItems = payload.items;
  if (!orderId || orderId.length > 120 || !paymentStatus || !Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > MAX_ITEMS) {
    return NextResponse.json({ ok: false, mensaje: "El pedido requiere orderId, paymentStatus y de 1 a 100 productos." }, { status: 400 });
  }

  const itemsBySku = new Map<string, { sku: string; cantidad: number; total: number }>();
  for (const rawItem of rawItems) {
    const item = objeto(rawItem);
    const sku = typeof item.sku === "string" ? item.sku.trim() : "";
    const cantidad = Number(item.quantity);
    const precioUnitario = Number(item.unitPrice ?? 0);
    if (!sku || sku.length > 120 || !Number.isInteger(cantidad) || cantidad <= 0 || cantidad > 100_000 ||
        !Number.isFinite(precioUnitario) || precioUnitario < 0 || precioUnitario > 99_999_999) {
      return NextResponse.json({ ok: false, mensaje: "El pedido contiene un SKU, una cantidad entera o un precio inválido." }, { status: 400 });
    }
    const skuNormalizado = sku.toUpperCase();
    const actual = itemsBySku.get(skuNormalizado) || { sku, cantidad: 0, total: 0 };
    actual.cantidad += cantidad;
    actual.total += cantidad * precioUnitario;
    itemsBySku.set(skuNormalizado, actual);
  }

  if (Array.from(itemsBySku.values()).some((item) => item.total > 9_999_999_999.99)) {
    return NextResponse.json({ ok: false, mensaje: "El importe de un producto excede el límite permitido." }, { status: 400 });
  }

  const items = Array.from(itemsBySku.values()).map((item) => ({
    sku: item.sku,
    cantidad: item.cantidad,
    precioUnitario: item.total / item.cantidad,
  }));
  const cliente = camposPermitidos(payload.customer, ["name", "email", "phone"]);
  const direccionEnvio = camposPermitidos(payload.shippingAddress, [
    "name", "email", "phone", "address1", "address2", "city", "state", "postalCode", "country",
  ]);
  const creadoExternoEn =
    typeof payload.createdAt === "string" && Number.isFinite(Date.parse(payload.createdAt))
      ? new Date(payload.createdAt).toISOString()
      : null;

  const { data, error } = await supabaseAdmin().rpc("recibir_pedido_godaddy", {
    p_pedido_externo_id: orderId,
    p_sucursal_id: sucursalId,
    p_estado_pago: paymentStatus,
    p_cliente: cliente,
    p_direccion_envio: direccionEnvio,
    p_creado_externo_en: creadoExternoEn,
    p_items: items,
  });
  if (error) {
    console.error("[webhook godaddy] no se pudo registrar pedido", error);
    const esDatoInvalido = error.code === "P0001";
    return NextResponse.json(
      { ok: false, mensaje: esDatoInvalido ? error.message : "No se pudo registrar el pedido." },
      { status: esDatoInvalido ? 422 : 500 }
    );
  }

  return NextResponse.json({ ok: true, ...objeto(data) }, { status: 200 });
}
