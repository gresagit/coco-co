import type { PostgrestError } from "@supabase/supabase-js";

const PAGE_SIZE = 500;

type PageResult<T> = {
  data: T[] | null;
  error: PostgrestError | null;
};

export async function cargarTodasLasFilas<T>(
  cargarPagina: (desde: number, hasta: number) => PromiseLike<PageResult<T>>
): Promise<T[]> {
  const filas: T[] = [];

  for (let desde = 0; ; desde += PAGE_SIZE) {
    const { data, error } = await cargarPagina(desde, desde + PAGE_SIZE - 1);
    if (error) throw error;

    const pagina = data || [];
    filas.push(...pagina);
    if (pagina.length < PAGE_SIZE) return filas;
  }
}
