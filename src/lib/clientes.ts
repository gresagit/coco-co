export type ClienteBase = {
  nombre: string;
  apellido: string;
  telefono: string;
  es_mayorista: boolean;
};

export type ClienteMayorista = ClienteBase & {
  es_mayorista: true;
  nombre_empresa: string;
  nombre_responsable: string;
  telefono_responsable?: string;
  correo_responsable?: string;
  lugar_origen: string;
  volumen_compra: string;
  productos_interes?: string;
};

export type ClienteOcasional = ClienteBase & {
  es_mayorista: false;
};

export type Cliente = ClienteMayorista | ClienteOcasional;

export function normalizarTexto(valor: FormDataEntryValue | string | null | undefined) {
  return String(valor ?? "").trim();
}

export function validarCliente(input: Partial<Cliente>): { ok: boolean; message?: string; cliente?: Cliente } {
  const nombre = normalizarTexto(input.nombre);
  const apellido = normalizarTexto(input.apellido);
  const telefono = normalizarTexto(input.telefono);

  if (!nombre || !apellido || !telefono) {
    return { ok: false, message: "El cliente necesita nombre, apellido y teléfono." };
  }

  if (!input.es_mayorista) {
    return {
      ok: true,
      cliente: {
        nombre,
        apellido,
        telefono,
        es_mayorista: false,
      },
    };
  }

  const nombreEmpresa = normalizarTexto((input as Partial<ClienteMayorista>).nombre_empresa);
  const nombreResponsable = normalizarTexto((input as Partial<ClienteMayorista>).nombre_responsable);
  const lugarOrigen = normalizarTexto((input as Partial<ClienteMayorista>).lugar_origen);
  const volumenCompra = normalizarTexto((input as Partial<ClienteMayorista>).volumen_compra);
  const correoResponsable = normalizarTexto((input as Partial<ClienteMayorista>).correo_responsable);

  if (!nombreEmpresa || !nombreResponsable || !lugarOrigen || !volumenCompra) {
    return {
      ok: false,
      message: "Cuando es mayorista, agrega la empresa, responsable, lugar de origen y volumen de compra.",
    };
  }

  return {
    ok: true,
    cliente: {
      nombre,
      apellido,
      telefono,
      es_mayorista: true,
      nombre_empresa: nombreEmpresa,
      nombre_responsable: nombreResponsable,
      telefono_responsable: normalizarTexto((input as Partial<ClienteMayorista>).telefono_responsable),
      correo_responsable: correoResponsable || undefined,
      lugar_origen: lugarOrigen,
      volumen_compra: volumenCompra,
      productos_interes: normalizarTexto((input as Partial<ClienteMayorista>).productos_interes),
    },
  };
}

export function normalizarClienteDesdeFormulario(formData: FormData): Cliente {
  const esMayorista = normalizarTexto(formData.get("cliente_tipo")).toLowerCase() === "mayorista";

  const base = {
    nombre: normalizarTexto(formData.get("cliente_nombre")),
    apellido: normalizarTexto(formData.get("cliente_apellido")),
    telefono: normalizarTexto(formData.get("cliente_telefono")),
    es_mayorista: esMayorista,
  };

  if (!esMayorista) {
    return {
      ...base,
      es_mayorista: false,
    };
  }

  return {
    ...base,
    es_mayorista: true,
    nombre_empresa: normalizarTexto(formData.get("cliente_empresa")),
    nombre_responsable: normalizarTexto(formData.get("cliente_responsable")),
    telefono_responsable: normalizarTexto(formData.get("cliente_telefono_responsable")) || undefined,
    correo_responsable: normalizarTexto(formData.get("cliente_correo_responsable")) || undefined,
    lugar_origen: normalizarTexto(formData.get("cliente_lugar_origen")),
    volumen_compra: normalizarTexto(formData.get("cliente_volumen_compra")),
    productos_interes: normalizarTexto(formData.get("cliente_productos_interes")) || undefined,
  };
}
