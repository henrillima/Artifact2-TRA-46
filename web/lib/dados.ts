import { supabase, todas } from './supabase';

export type Nivel = 'brasil' | 'empresa' | 'rota';
export type SerieMes = { periodo: string; assentos: number; tarifa_real: number; tarifa_nominal: number; hhi: number | null };
export type Prev = { modelo: string; periodo: string; h: number; previsto: number; lo80: number; hi80: number; lo95: number; hi95: number; melhor: boolean };
export type PrevAssentos = { periodo: string; h: number; assentos: number };
export type Metrica = { modelo: string; nivel: string; mape: number; rmse_log: number; n: number; nome: string; rank: number; mae?: number | null; rmse?: number | null };
export type Rota = {
  rota: string; origem: string; destino: string; nome: string; cidades: string; distancia_km: number | null;
  assentos_12m: number; tarifa_real_12m: number; hhi_12m: number | null; rank: number; cluster: number | null;
  segmento: string | null; sazonalidade: number | null; volatilidade: number | null; crescimento: number | null;
};
export type RotaEmpresa = { rota: string; grupo: string; assentos: number; tarifa_real: number; share: number };
export type AeroMes = {
  icao: string; aeroporto: string; cidade: string; periodo: string; mov: number; tarifa: number; yoy_mov: number;
  rel_mov: number; rel_tarifa: number; z_robusto: number | null; escore_isolamento: number; anomalo: boolean;
  escore_lof?: number | null; escore_kmedias?: number | null; escore_gmm?: number | null; evento_conhecido?: boolean | null;
};
export type Evento = { id: string; nome: string; escopo: string; aeroporto: string | null; inicio: string; nota: string;
  trajetoria: { k: number; periodo: string; assentos: number; tarifa: number }[] };
export type Cenario = { id: number; criado_em: string; autor: string; nome: string; tipo: string; parametros: Record<string, unknown>; resumo: Record<string, unknown> | null };

const cache = new Map<string, Promise<unknown>>();
function memo<T>(chave: string, f: () => Promise<T>): Promise<T> {
  if (!cache.has(chave)) cache.set(chave, f().catch((e) => { cache.delete(chave); throw e; }));
  return cache.get(chave) as Promise<T>;
}

export const getParametros = () => memo('par', async () => {
  const { data, error } = await supabase.from('parametros').select('chave, valor');
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r) => [r.chave, r.valor])) as Record<string, any>;
});

export const getSerie = (nivel: Nivel, chave: string) => memo(`s:${nivel}:${chave}`, () =>
  todas<SerieMes>((de, ate) => supabase.from('serie_mensal').select('periodo, assentos, tarifa_real, tarifa_nominal, hhi')
    .eq('nivel', nivel).eq('chave', chave).order('periodo').range(de, ate)));

export const getPrevisao = (nivel: Nivel, chave: string) => memo(`p:${nivel}:${chave}`, () =>
  todas<Prev>((de, ate) => supabase.from('previsao').select('modelo, periodo, h, previsto, lo80, hi80, lo95, hi95, melhor')
    .eq('nivel', nivel).eq('chave', chave).order('periodo').range(de, ate)));

export const getPrevAssentos = (nivel: Nivel, chave: string) => memo(`pa:${nivel}:${chave}`, () =>
  todas<PrevAssentos>((de, ate) => supabase.from('previsao_assentos').select('periodo, h, assentos')
    .eq('nivel', nivel).eq('chave', chave).order('periodo').range(de, ate)));

export const getMetricas = () => memo('met', () =>
  todas<Metrica>((de, ate) => supabase.from('metricas_modelos').select('*').range(de, ate)));

export const getTopRotas = (n = 300) => memo(`rotas:${n}`, () =>
  todas<Rota>((de, ate) => supabase.from('rotas').select('*').lte('rank', n).order('rank').range(de, ate)));

export async function buscarRotas(q: string): Promise<Rota[]> {
  const { data, error } = await supabase.rpc('buscar_rotas', { q });
  if (error) throw error;
  return (data ?? []) as Rota[];
}

export const getRotaEmpresa = () => memo('re', () =>
  todas<RotaEmpresa>((de, ate) => supabase.from('rota_empresa').select('*').range(de, ate)));

export const getAeroportos = () => memo('aero', () =>
  todas<AeroMes>((de, ate) => supabase.from('aeroporto_mensal').select('*').order('periodo').range(de, ate)));

export const getEventos = () => memo('ev', async () => {
  const { data, error } = await supabase.from('eventos').select('*');
  if (error) throw error;
  return (data ?? []) as Evento[];
});

export const serieRotaEmpresa = (rota: string) => memo(`sre:${rota}`, async () => {
  const { data, error } = await supabase.rpc('serie_rota_empresa', { p_rota: rota });
  if (error) throw error;
  return (data ?? []) as { periodo: string; grupo: string; assentos: number; tarifa_real: number }[];
});

export async function listarCenarios(): Promise<Cenario[]> {
  const { data, error } = await supabase.from('cenarios').select('*').order('criado_em', { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []) as Cenario[];
}

export async function salvarCenario(c: Omit<Cenario, 'id' | 'criado_em'>) {
  const { error } = await supabase.from('cenarios').insert(c);
  if (error) throw error;
}

/** Previsão para qualquer rota sem modelo próprio: previsão nacional x nível relativo dos últimos 12 meses. */
export async function previsaoHierarquica(serie: SerieMes[]): Promise<Prev[]> {
  const [br, pbr, par] = await Promise.all([getSerie('brasil', 'BR'), getPrevisao('brasil', 'BR'), getParametros()]);
  const erros = (par.erros_hierarquico_rota ?? {}) as Record<string, Record<string, number>>;
  const mapaBr = new Map(br.map((x) => [x.periodo, x.tarifa_real]));
  const ult = serie.slice(-12).filter((x) => mapaBr.has(x.periodo));
  if (ult.length < 9) return [];
  const rel = ult.reduce((a, x) => a + Math.log(x.tarifa_real / (mapaBr.get(x.periodo) as number)), 0) / ult.length;
  const f = Math.exp(rel);
  // ponto: previsão nacional do modelo sazonal ingênuo (o mesmo usado na validação); faixas: erros do modelo
  // hierárquico nas rotas, por horizonte
  return pbr.filter((p) => p.modelo === 'ingenuo').map((p) => {
    const y = p.previsto * f;
    const q = erros[String(Math.min(p.h, 12))] ?? { '0.025': -0.4, '0.1': -0.25, '0.9': 0.25, '0.975': 0.4 };
    return { ...p, modelo: 'hierarquico', previsto: y, lo95: y * Math.exp(q['0.025']), lo80: y * Math.exp(q['0.1']),
      hi80: y * Math.exp(q['0.9']), hi95: y * Math.exp(q['0.975']), melhor: true };
  });
}

/**
 * Dados das telas de análise do ARTEF1 (base completa). Ficam na tabela "analises", uma linha por bloco
 * (meta, meses, nac, anual, rotas, aero, casos...). Se o banco ainda não tiver a tabela, usa a cópia estática
 * gerada pelo mesmo script (public/dados/analises.json).
 */
export const getAnalises = () => memo('analises', async () => {
  try {
    const { data, error } = await supabase.from('analises').select('secao, dados');
    if (error) throw error;
    if (data && data.length) return Object.fromEntries(data.map((r) => [r.secao, r.dados])) as Record<string, any>;
  } catch { /* cai para a cópia estática */ }
  const r = await fetch('/dados/analises.json');
  if (!r.ok) throw new Error('dados das análises indisponíveis');
  return (await r.json()) as Record<string, any>;
});

export const getRota = (chave: string) => memo(`rota:${chave}`, async () => {
  const { data, error } = await supabase.from('rotas').select('*').eq('rota', chave).limit(1);
  if (error) throw error;
  return ((data ?? [])[0] ?? null) as Rota | null;
});
