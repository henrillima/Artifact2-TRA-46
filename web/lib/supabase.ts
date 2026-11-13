import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(url, chave, { auth: { persistSession: false } });

/** Busca todas as linhas de uma consulta, paginando de 1000 em 1000 (limite padrão da API). */
export async function todas<T>(montar: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const saida: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await montar(de, de + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    saida.push(...data);
    if (data.length < 1000) break;
  }
  return saida;
}
